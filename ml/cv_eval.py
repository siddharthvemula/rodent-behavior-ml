"""
Repeated grouped cross-validation on TRAIN only, with error bars.

This is the development loop for pushing macro-F1: it never reads the test
split. Every experiment (feature set, hyperparameters, class weights) goes
through here, is compared on the SAME folds, and the test split is evaluated
once at the end by train.py.

    python ml/cv_eval.py run  --name baseline                      # fit + save out-of-fold probs
    python ml/cv_eval.py run  --name v2 --feature-set v2
    python ml/cv_eval.py report --name baseline [--window 31]      # score saved OOF probs
    python ml/cv_eval.py compare --a baseline --b v2               # paired difference + CI

Why this exists (see the investigation in the PR): 5-fold CV on one fixed split
has fold SD +-0.014, and test macro-F1 has a +-0.025 bootstrap CI over 19
recordings, so a +0.005 change cannot be seen without (a) several repeats of
differently-shuffled recording-level folds and (b) a PAIRED comparison on
identical folds. Out-of-fold probabilities are saved so post-processing and
class-weight sweeps are cheap (no refit).

Reported per config: pooled macro-F1 per repeat (mean over repeats), per-class
F1, bootstrap-over-recordings 95% CI, and the three confusion cells that
dominate the error budget (investigation->attack, investigation->other,
other->investigation).
"""
import argparse
import json
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

import features as F
import model as M
import preprocess as P

REPO_ROOT = Path(__file__).resolve().parent.parent
PROCESSED = REPO_ROOT / "data" / "processed"
CV_DIR = PROCESSED / "cv"  # gitignored with the rest of data/processed
LABELS = P.BEHAVIOR_LABELS
N = len(LABELS)
ATTACK, INVESTIGATION, MOUNT, OTHER = (LABELS.index(k) for k in ("attack", "investigation", "mount", "other"))


# ---------------------------------------------------------------- splits ----
def make_folds(n_recordings: int, folds: int, repeat: int, seed: int = 0) -> List[np.ndarray]:
    """Recording-level folds: a different random assignment per repeat, and a
    recording is never split across train/validation."""
    order = np.random.default_rng([seed, repeat]).permutation(n_recordings)
    return [np.sort(f) for f in np.array_split(order, folds)]


# --------------------------------------------------------------- metrics ----
def confusion(y_true: np.ndarray, y_pred: np.ndarray) -> np.ndarray:
    return np.bincount(y_true * N + y_pred, minlength=N * N).reshape(N, N)


def f1_from_confusion(cm: np.ndarray) -> np.ndarray:
    tp = np.diag(cm).astype(float)
    denom = cm.sum(0) + cm.sum(1)
    return np.divide(2 * tp, denom, out=np.zeros(N), where=denom > 0)


def decode(probs: np.ndarray, window: int = 1, scale: Optional[np.ndarray] = None) -> np.ndarray:
    p = M.smooth_probs(probs, window)
    if scale is not None:
        p = p * scale
    return p.argmax(1)


def per_recording_confusions(labels: List[np.ndarray], probs: List[np.ndarray], window: int = 1,
                             scale: Optional[np.ndarray] = None, decoder=None) -> np.ndarray:
    """(n_recordings, N, N). `decoder(probs)->labels` overrides window/scale."""
    out = []
    for y, p in zip(labels, probs):
        yp = decoder(p) if decoder is not None else decode(p, window, scale)
        out.append(confusion(y, yp))
    return np.array(out)


def summarize_cms(cms: np.ndarray) -> Dict:
    """cms: (repeats, n_recordings, N, N) -> pooled metrics averaged over repeats."""
    pooled = cms.sum(1)                                  # (repeats, N, N)
    per = np.array([f1_from_confusion(c) for c in pooled])  # (repeats, N)
    macro = per.mean(1)
    cm_mean = pooled.mean(0)
    return {
        "macro_f1": float(macro.mean()), "macro_f1_per_repeat": [float(x) for x in macro],
        "per_class_f1": {k: float(v) for k, v in zip(LABELS, per.mean(0))},
        "cells": {"investigation->attack": float(cm_mean[INVESTIGATION, ATTACK]),
                  "investigation->other": float(cm_mean[INVESTIGATION, OTHER]),
                  "other->investigation": float(cm_mean[OTHER, INVESTIGATION]),
                  "attack_precision": float(cm_mean[ATTACK, ATTACK] / max(cm_mean[:, ATTACK].sum(), 1)),
                  "attack_recall": float(cm_mean[ATTACK, ATTACK] / max(cm_mean[ATTACK].sum(), 1))},
    }


def macro_f1_of(cms: np.ndarray) -> float:
    """Mean over repeats of pooled macro-F1; cms (repeats, n_rec, N, N)."""
    return float(np.mean([f1_from_confusion(c).mean() for c in cms.sum(1)]))


def bootstrap_ci(cms_a: np.ndarray, cms_b: Optional[np.ndarray] = None, n_boot: int = 1000, seed: int = 0):
    """95% CI over RECORDINGS (resampled with replacement, same draw for A and
    B so the difference is paired). Returns (ci_a, ci_diff or None)."""
    rng = np.random.default_rng(seed)
    n = cms_a.shape[1]
    a, d = [], []
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        ma = macro_f1_of(cms_a[:, idx])
        a.append(ma)
        if cms_b is not None:
            d.append(macro_f1_of(cms_b[:, idx]) - ma)
    ci = lambda v: [float(x) for x in np.percentile(v, [2.5, 97.5])]
    return ci(a), (ci(d) if cms_b is not None else None)


# ------------------------------------------------------------------- I/O ----
def oof_path(name: str) -> Path:
    return CV_DIR / f"oof_{name}.npz"


def load_oof(name: str):
    """-> (labels list, probs[repeat][recording] list of (T,N) arrays, meta)."""
    z = np.load(oof_path(name), allow_pickle=True)
    return list(z["labels"]), [list(r) for r in z["probs"]], json.loads(str(z["meta"]))


def load_train():
    return P.load_recordings(PROCESSED / "calms21_task1_train.npz")


# ------------------------------------------------------------------- run ----
def run(args) -> None:
    recs = load_train()
    feats = [F.compute_features(r.keypoints, feature_set=args.feature_set) for r in recs]
    labels = [r.labels for r in recs]
    params = json.loads(args.params) if args.params else {}
    print(f"[{args.name}] {len(recs)} recordings, {feats[0].shape[1]} features ({args.feature_set}), "
          f"params {params or 'default'}, {args.repeats} repeats x {args.folds} folds, stride {args.stride}", flush=True)
    all_probs: List[List[np.ndarray]] = []
    t0 = time.time()
    for rep in range(args.first_repeat, args.first_repeat + args.repeats):
        oof: List[Optional[np.ndarray]] = [None] * len(recs)
        for k, va in enumerate(make_folds(len(recs), args.folds, rep)):
            tr = np.setdiff1d(np.arange(len(recs)), va)
            X = np.concatenate([feats[i] for i in tr])[:: args.stride]
            y = np.concatenate([labels[i] for i in tr])[:: args.stride]
            fit_params = dict(params)
            if args.attack_weight != 1.0:
                # "balanced" weights, then scale only the attack class.
                counts = np.bincount(y, minlength=N)
                cw = {c: len(y) / (N * max(counts[c], 1)) for c in range(N)}
                cw[ATTACK] *= args.attack_weight
                fit_params["class_weight"] = cw
            clf = M.build_classifier(**fit_params).fit(X, y)
            for i in va:
                oof[i] = clf.predict_proba(feats[i]).astype(np.float32)
            print(f"  repeat {rep} fold {k}: {time.time() - t0:.0f}s", flush=True)
        all_probs.append(oof)
    CV_DIR.mkdir(parents=True, exist_ok=True)
    probs_arr = np.empty((args.repeats, len(recs)), dtype=object)
    for r in range(args.repeats):
        for i in range(len(recs)):
            probs_arr[r, i] = all_probs[r][i]
    labels_arr = np.empty(len(recs), dtype=object)
    for i, y in enumerate(labels):
        labels_arr[i] = y
    meta = dict(name=args.name, feature_set=args.feature_set, params=params, repeats=args.repeats,
                first_repeat=args.first_repeat, attack_weight=args.attack_weight,
                folds=args.folds, stride=args.stride, n_features=int(feats[0].shape[1]),
                seconds=round(time.time() - t0))
    np.savez(oof_path(args.name), labels=labels_arr, probs=probs_arr, meta=json.dumps(meta))
    print(f"saved {oof_path(args.name)}")
    show_report(args.name, window=M.SMOOTHING_WINDOW)


def cms_for(name: str, window: int = 1, scale=None, decoder=None, repeats=None) -> np.ndarray:
    """(repeats, n_rec, N, N). `repeats` = absolute repeat indices to keep
    (an OOF file holds repeats first_repeat .. first_repeat+repeats-1)."""
    labels, probs, meta = load_oof(name)
    first = meta.get("first_repeat", 0)
    keep = range(len(probs)) if repeats is None else [r - first for r in repeats]
    return np.array([per_recording_confusions(labels, probs[k], window, scale, decoder) for k in keep])


def repeat_ids(name: str) -> List[int]:
    meta = load_oof(name)[2]
    return list(range(meta.get("first_repeat", 0), meta.get("first_repeat", 0) + meta["repeats"]))


def show_report(name: str, window: int, scale=None) -> None:
    cms = cms_for(name, window, scale)
    s = summarize_cms(cms)
    ci, _ = bootstrap_ci(cms)
    pc = s["per_class_f1"]
    print(f"[{name}] window={window}: macro-F1 {s['macro_f1']:.4f} "
          f"(per repeat {', '.join(f'{x:.3f}' for x in s['macro_f1_per_repeat'])}; "
          f"95% CI over recordings {ci[0]:.3f}-{ci[1]:.3f})")
    print("   per-class F1: " + ", ".join(f"{k} {pc[k]:.3f}" for k in LABELS))
    c = s["cells"]
    print(f"   inv->attack {c['investigation->attack']:.0f}  inv->other {c['investigation->other']:.0f}  "
          f"other->inv {c['other->investigation']:.0f}  attack P {c['attack_precision']:.3f} R {c['attack_recall']:.3f}")


def compare(a: str, b: str, window: int) -> None:
    shared = sorted(set(repeat_ids(a)) & set(repeat_ids(b)))
    if not shared:
        raise SystemExit(f"{a} and {b} share no repeats ({repeat_ids(a)} vs {repeat_ids(b)}): folds differ, not comparable")
    ca, cb = cms_for(a, window, repeats=shared), cms_for(b, window, repeats=shared)
    print(f"(paired on repeats {shared})")
    ci_a, ci_d = bootstrap_ci(ca, cb)
    ma, mb = macro_f1_of(ca), macro_f1_of(cb)
    pa, pb = summarize_cms(ca)["per_class_f1"], summarize_cms(cb)["per_class_f1"]
    print(f"{a}: {ma:.4f}   {b}: {mb:.4f}   diff {mb - ma:+.4f}  paired 95% CI [{ci_d[0]:+.4f}, {ci_d[1]:+.4f}]"
          f"  -> {'significant' if ci_d[0] > 0 or ci_d[1] < 0 else 'NOT distinguishable from noise'}")
    print("   per-class diff: " + ", ".join(f"{k} {pb[k] - pa[k]:+.3f}" for k in LABELS))


def postproc_candidates():
    """(label, decoder(probs)->labels). Every one is a pure function of a
    recording's probabilities, so it is scored on out-of-fold probs, no refit."""
    c = [(f"window {w}", (lambda p, w=w: decode(p, w))) for w in (1, 5, 9, 15, 21, 31, 45, 61)]
    for w in (1, 9):
        for lam in (0.5, 1, 2, 3, 5, 8):
            c.append((f"viterbi lam={lam} after window {w}", lambda p, lam=lam, w=w: M.viterbi_decode(M.smooth_probs(p, w), lam)))
    for w in (5, 15, 31):
        for k in (5, 10, 15, 30):
            c.append((f"window {w} + min-bout {k}", lambda p, w=w, k=k: M.min_bout_filter(decode(p, w), M.smooth_probs(p, w), k)))
    # per-class windows: (attack, investigation, mount, other)
    for ws in ((31, 9, 31, 31), (15, 9, 31, 45), (31, 15, 31, 61), (9, 9, 15, 31), (15, 15, 31, 61)):
        c.append((f"per-class windows {ws}", lambda p, ws=ws: M.smooth_probs_per_class(p, ws).argmax(1)))
    return c


def postproc(name: str, ref_window: int, top: int) -> None:
    labels, probs, meta = load_oof(name)
    ref = np.array([per_recording_confusions(labels, p, ref_window) for p in probs])
    rows = []
    for label, dec in postproc_candidates():
        cms = np.array([per_recording_confusions(labels, p, decoder=dec) for p in probs])
        _, ci_d = bootstrap_ci(ref, cms, n_boot=300)
        rows.append((macro_f1_of(cms), label, ci_d, summarize_cms(cms)["per_class_f1"]))
        print(f"  done {label}", flush=True)
    rows.sort(key=lambda r: -r[0])
    base = macro_f1_of(ref)
    print(f"\n[{name}] post-processing sweep, reference = window {ref_window} (macro-F1 {base:.4f}); paired 95% CI over recordings")
    for m, label, ci_d, pc in rows[:top] + [r for r in rows[top:] if r[1] in (f"window {ref_window}", "window 1")]:
        print(f"  {m:.4f}  {m - base:+.4f} [{ci_d[0]:+.4f},{ci_d[1]:+.4f}]  {label:<42} "
              + " ".join(f"{k[:3]} {pc[k]:.3f}" for k in LABELS))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--name", required=True)
    r.add_argument("--feature-set", default=F.DEFAULT_FEATURE_SET)
    r.add_argument("--params", default="", help='JSON overrides for build_classifier, e.g. \'{"max_iter":300}\'')
    r.add_argument("--repeats", type=int, default=3)
    r.add_argument("--first-repeat", type=int, default=0, help="fold-shuffle index to start at (repeat k always uses the same folds)")
    r.add_argument("--attack-weight", type=float, default=1.0, help="multiplier on the balanced class weight of `attack`")
    r.add_argument("--folds", type=int, default=5)
    r.add_argument("--stride", type=int, default=2)
    rp = sub.add_parser("report")
    rp.add_argument("--name", required=True)
    rp.add_argument("--window", type=int, default=M.SMOOTHING_WINDOW)
    pp = sub.add_parser("postproc")
    pp.add_argument("--name", required=True)
    pp.add_argument("--ref-window", type=int, default=M.SMOOTHING_WINDOW)
    pp.add_argument("--top", type=int, default=12)
    c = sub.add_parser("compare")
    c.add_argument("--a", required=True)
    c.add_argument("--b", required=True)
    c.add_argument("--window", type=int, default=M.SMOOTHING_WINDOW)
    args = ap.parse_args()
    if args.cmd == "run":
        run(args)
    elif args.cmd == "postproc":
        postproc(args.name, args.ref_window, args.top)
    elif args.cmd == "report":
        show_report(args.name, args.window)
    else:
        compare(args.a, args.b, args.window)


if __name__ == "__main__":
    main()
