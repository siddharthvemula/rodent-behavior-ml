"""
Trains and evaluates the scikit-learn baseline on CalMS21 Task 1.

    python ml/preprocess.py          # once: build data/processed/*.npz
    python ml/train.py               # CV on train, fit, evaluate on test, save

Protocol (follows the CalMS21 guidance: develop on train only, hold out
validation from train, report test over multiple seeds):
  1. Grouped K-fold CV over TRAIN recordings (never splits a recording) ->
     the number to trust while developing. Hyperparameters and the smoothing
     window were chosen from this, not from test.
  2. Fit on all of train with several seeds (each seed trains on a different
     random half of the frames; neighbouring frames are near-duplicates).
  3. Evaluate on the official TEST split once per seed -> reported mean/std.
  4. Save the seed-0 model to ml/model.joblib and all numbers to
     ml/metrics.json.

Metric: frame-level macro-F1 and per-class F1. `other` is ~60% of frames, so
accuracy is meaningless. Also reported: per-recording error in behavior
FREQUENCIES, since that is what the control-vs-treated view diffs.
"""
import argparse
import json
import platform
import time
from pathlib import Path
from typing import Dict, List

import numpy as np
import sklearn
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import GroupKFold

import features as F
import model as M
import preprocess as P

REPO_ROOT = Path(__file__).resolve().parent.parent
PROCESSED = REPO_ROOT / "data" / "processed"
METRICS_PATH = Path(__file__).resolve().parent / "metrics.json"
LABELS = P.BEHAVIOR_LABELS


def featurize(recs: List[P.Recording]) -> List[np.ndarray]:
    return [F.compute_features(r.keypoints) for r in recs]


def predict_recordings(clf, feats: List[np.ndarray], window: int) -> List[np.ndarray]:
    """Smoothed class probabilities, one (T, 4) array per recording. Smoothing
    is per recording so it never bleeds across videos."""
    return [M.smooth_probs(clf.predict_proba(x), window) for x in feats]


def macro_and_per_class(y_true: np.ndarray, y_pred: np.ndarray) -> Dict:
    per = f1_score(y_true, y_pred, labels=range(len(LABELS)), average=None, zero_division=0)
    return {
        "macro_f1": float(per.mean()),
        "per_class_f1": {name: float(v) for name, v in zip(LABELS, per)},
        # CalMS21's leaderboard-style number: mean F1 over the three
        # behaviors of interest, ignoring the `other` background class.
        "mean_f1_excluding_other": float(per[: LABELS.index("other")].mean()),
    }


def frequency_error(recs: List[P.Recording], probs: List[np.ndarray]) -> Dict:
    """Per-recording |predicted - true| fraction of time in each behavior."""
    n = len(LABELS)
    true_f = np.array([np.bincount(r.labels, minlength=n) / len(r) for r in recs])
    pred_f = np.array([np.bincount(p.argmax(1), minlength=n) / len(p) for p in probs])
    mae = np.abs(true_f - pred_f).mean(axis=0)
    corr = [
        float(np.corrcoef(true_f[:, k], pred_f[:, k])[0, 1]) if true_f[:, k].std() > 0 and pred_f[:, k].std() > 0 else None
        for k in range(n)
    ]
    return {
        "mae_by_label": {name: float(v) for name, v in zip(LABELS, mae)},
        "pearson_r_by_label": {name: c for name, c in zip(LABELS, corr)},
    }


def cross_validate(recs, feats, window: int, folds: int, stride: int) -> Dict:
    groups = np.arange(len(recs))
    per_fold = []
    pooled_true, pooled_pred = [], []
    for k, (tr_idx, va_idx) in enumerate(GroupKFold(n_splits=folds).split(groups, groups=groups)):
        X = np.concatenate([feats[i] for i in tr_idx])[::stride]
        y = np.concatenate([recs[i].labels for i in tr_idx])[::stride]
        clf = M.build_classifier().fit(X, y)
        probs = predict_recordings(clf, [feats[i] for i in va_idx], window)
        yt = np.concatenate([recs[i].labels for i in va_idx])
        yp = np.concatenate([p.argmax(1) for p in probs])
        per_fold.append(macro_and_per_class(yt, yp)["macro_f1"])
        pooled_true.append(yt)
        pooled_pred.append(yp)
        print(f"  fold {k + 1}/{folds}: macro-F1 {per_fold[-1]:.3f}", flush=True)
    res = macro_and_per_class(np.concatenate(pooled_true), np.concatenate(pooled_pred))
    res.update(fold_macro_f1=per_fold, fold_mean=float(np.mean(per_fold)), fold_std=float(np.std(per_fold)))
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--stride", type=int, default=2, help="train on every Nth frame (CV) / a random 1/N of frames (final)")
    ap.add_argument("--no-save", action="store_true", help="evaluate only; don't overwrite model.joblib / metrics.json")
    ap.add_argument("--skip-cv", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    train = P.load_recordings(PROCESSED / "calms21_task1_train.npz")
    test = P.load_recordings(PROCESSED / "calms21_task1_test.npz")
    f_train, f_test = featurize(train), featurize(test)
    window = M.SMOOTHING_WINDOW
    print(f"train {len(train)} recordings / test {len(test)} recordings, "
          f"{len(F.FEATURE_NAMES)} features, smoothing window {window} frames")

    metrics: Dict = {
        "dataset": "CalMS21 Task 1",
        "n_train_recordings": len(train), "n_test_recordings": len(test),
        "n_features": len(F.FEATURE_NAMES),
        "classifier": "HistGradientBoostingClassifier", "params": M.DEFAULT_PARAMS,
        "smoothing_window_frames": window,
        "versions": {"scikit-learn": sklearn.__version__, "numpy": np.__version__, "python": platform.python_version()},
    }

    if not args.skip_cv:
        print(f"{args.folds}-fold grouped CV on train:")
        metrics["cv_train"] = cross_validate(train, f_train, window, args.folds, args.stride)
        print(f"  pooled macro-F1 {metrics['cv_train']['macro_f1']:.3f}, "
              f"per fold {metrics['cv_train']['fold_mean']:.3f} +- {metrics['cv_train']['fold_std']:.3f}")

    # ---- final fits, evaluated on the official test split ----
    X_all = np.concatenate(f_train)
    y_all = np.concatenate([r.labels for r in train])
    y_test = np.concatenate([r.labels for r in test])
    runs, first_clf = [], None
    print(f"final fit on all train, {args.seeds} seeds, evaluated on test:")
    for seed in range(args.seeds):
        rng = np.random.default_rng(seed)
        keep = rng.random(len(y_all)) < 1.0 / args.stride
        clf = M.build_classifier(random_state=seed).fit(X_all[keep], y_all[keep])
        probs = predict_recordings(clf, f_test, window)
        raw = predict_recordings(clf, f_test, 1)
        y_pred = np.concatenate([p.argmax(1) for p in probs])
        run = macro_and_per_class(y_test, y_pred)
        run["macro_f1_unsmoothed"] = macro_and_per_class(y_test, np.concatenate([p.argmax(1) for p in raw]))["macro_f1"]
        run["frequency_error"] = frequency_error(test, probs)
        run["seed"] = seed
        runs.append(run)
        if seed == 0:
            first_clf = clf
            metrics["test_confusion_matrix_seed0"] = {
                "labels": LABELS, "rows_true_cols_pred": confusion_matrix(y_test, y_pred, labels=range(len(LABELS))).tolist()}
        print(f"  seed {seed}: macro-F1 {run['macro_f1']:.3f} (unsmoothed {run['macro_f1_unsmoothed']:.3f}), "
              f"per-class " + ", ".join(f"{k} {v:.3f}" for k, v in run["per_class_f1"].items()), flush=True)

    macro = np.array([r["macro_f1"] for r in runs])
    metrics["test"] = {
        "runs": runs,
        "macro_f1_mean": float(macro.mean()), "macro_f1_std": float(macro.std()),
        "per_class_f1_mean": {k: float(np.mean([r["per_class_f1"][k] for r in runs])) for k in LABELS},
        "mean_f1_excluding_other_mean": float(np.mean([r["mean_f1_excluding_other"] for r in runs])),
    }

    # ---- sanity controls: a number only means something next to these ----
    maj = np.full_like(y_test, LABELS.index("other"))
    metrics["control_always_other"] = macro_and_per_class(y_test, maj)
    shuf = np.random.default_rng(0).permutation(y_all)
    clf_s = M.build_classifier().fit(X_all[::args.stride * 2], shuf[::args.stride * 2])
    yp_s = np.concatenate([p.argmax(1) for p in predict_recordings(clf_s, f_test, window)])
    metrics["control_shuffled_labels"] = macro_and_per_class(y_test, yp_s)
    print(f"controls on test: always-'other' macro-F1 {metrics['control_always_other']['macro_f1']:.3f}, "
          f"shuffled-label model {metrics['control_shuffled_labels']['macro_f1']:.3f}")

    print(f"TEST macro-F1 {metrics['test']['macro_f1_mean']:.3f} +- {metrics['test']['macro_f1_std']:.3f} "
          f"over {args.seeds} seeds; mean F1 excluding 'other' {metrics['test']['mean_f1_excluding_other_mean']:.3f}")
    print("test frequency error (mean abs, fraction of time), seed 0: " +
          ", ".join(f"{k} {v:.3f}" for k, v in runs[0]["frequency_error"]["mae_by_label"].items()))

    metrics["train_seconds"] = round(time.time() - t0)
    if args.no_save:
        print("--no-save: not writing model.joblib / metrics.json")
        return
    M.save_model(first_clf, {"trained_on": "CalMS21 Task 1 train", "seed": 0,
                             "test_macro_f1_mean": metrics["test"]["macro_f1_mean"]})
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(f"saved {M.MODEL_PATH.name} ({M.MODEL_PATH.stat().st_size / 1e6:.1f} MB) and {METRICS_PATH.name}")


if __name__ == "__main__":
    main()
