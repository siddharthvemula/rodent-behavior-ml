"""
The two functions backend/main.py calls. Signatures match ARCHITECTURE.md's
API contract exactly (predict returns an ordered list of behavior segments,
compare returns {control, treated, difference} frequency dicts) so swapping
the model underneath (model.py) never requires a backend change.
"""
from typing import Dict, List

from model import BEHAVIOR_LABELS, WINDOW_SECONDS, load_model
from preprocess import Frame, extract_features

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = load_model()
    return _model


def predict_behaviors(frames: List[Frame], frame_rate: float = 30.0) -> List[dict]:
    """Classify a sequence of keypoint frames into behavior segments.

    Slides a fixed window across the frames, classifies each window, then
    merges consecutive windows with the same label into one segment so the
    output matches BehaviorSegment's {start_time, end_time, behavior_label,
    confidence} shape (confidence = the model's probability for the label
    it picked, averaged over the merged windows).
    """
    model = _get_model()
    window_frames = max(int(WINDOW_SECONDS * frame_rate), 1)

    windows = []
    for start in range(0, len(frames) - window_frames + 1, window_frames) or [0]:
        windows.append(frames[start : start + window_frames] or frames)
    if not windows:
        windows = [frames]

    features = [extract_features(w) for w in windows]
    probs = model.predict_proba(features)
    labels = [BEHAVIOR_LABELS[i] for i in probs.argmax(axis=1)]
    confidences = probs.max(axis=1)

    segments: List[dict] = []
    for i, label in enumerate(labels):
        start_time = round(i * window_frames / frame_rate, 2)
        end_time = round((i + 1) * window_frames / frame_rate, 2)
        if segments and segments[-1]["behavior_label"] == label:
            segments[-1]["end_time"] = end_time
            segments[-1]["_confidences"].append(confidences[i])
        else:
            segments.append(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "behavior_label": label,
                    "_confidences": [confidences[i]],
                }
            )

    for seg in segments:
        seg["confidence"] = round(float(sum(seg["_confidences"]) / len(seg["_confidences"])), 2)
        del seg["_confidences"]

    return segments


def _behavior_frequencies(segments: List[dict]) -> Dict[str, float]:
    total = sum(seg["end_time"] - seg["start_time"] for seg in segments)
    if total <= 0:
        return {label: 0.0 for label in BEHAVIOR_LABELS}
    freq: Dict[str, float] = {label: 0.0 for label in BEHAVIOR_LABELS}
    for seg in segments:
        freq[seg["behavior_label"]] += seg["end_time"] - seg["start_time"]
    return {label: round(duration / total, 2) for label, duration in freq.items()}


def compare_behaviors(
    control_frames: List[Frame],
    treated_frames: List[Frame],
    control_frame_rate: float = 30.0,
    treated_frame_rate: float = 30.0,
) -> dict:
    control_freq = _behavior_frequencies(predict_behaviors(control_frames, control_frame_rate))
    treated_freq = _behavior_frequencies(predict_behaviors(treated_frames, treated_frame_rate))
    difference = {
        label: round(treated_freq[label] - control_freq[label], 2) for label in BEHAVIOR_LABELS
    }
    return {"control": control_freq, "treated": treated_freq, "difference": difference}
