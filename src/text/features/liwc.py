"""LIWC (Linguistic Inquiry and Word Count) analysis.

Provides a minimal built-in dictionary covering key psycholinguistic dimensions
in both English and Chinese.  Users may supply a full LIWC dictionary via
*dict_path* for production use.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Built-in minimal LIWC dictionary
# Keys are dimension names; values are sets of lowercase tokens.
# English and Chinese words are mixed in the same set for each dimension.
# ---------------------------------------------------------------------------

_BUILTIN_DICT: dict[str, set[str]] = {
    # --- Cognitive processes ---
    "cognitive": {
        # English
        "think", "know", "consider", "believe", "understand", "realize",
        "assume", "reason", "suppose", "decide", "recognize", "wonder",
        "imagine", "conclude", "reflect", "question", "analyze", "evaluate",
        "perceive", "infer", "perhaps", "maybe", "because", "cause", "effect",
        # Chinese
        "想", "知道", "认为", "相信", "理解", "意识", "假设", "推理",
        "决定", "考虑", "觉得", "以为", "思考", "判断", "分析",
        "推测", "怀疑", "猜想", "领悟", "明白", "也许", "因为", "所以",
    },
    # --- Affective processes ---
    "affective": {
        # English
        "happy", "sad", "angry", "love", "hate", "fear", "joy", "anxious",
        "excited", "depressed", "grateful", "proud", "ashamed", "jealous",
        "hopeful", "worried", "pleased", "upset", "delighted", "furious",
        "wonderful", "terrible", "good", "bad", "great", "awful",
        # Chinese
        "高兴", "开心", "快乐", "悲伤", "愤怒", "生气", "爱", "恨",
        "害怕", "恐惧", "焦虑", "兴奋", "骄傲", "惭愧", "嫉妒",
        "担心", "满意", "失望", "愉快", "痛苦", "美好", "糟糕",
        "幸福", "难过", "喜欢", "讨厌", "感动",
    },
    # --- Social processes ---
    "social": {
        # English
        "friend", "talk", "share", "help", "they", "them", "people",
        "group", "team", "community", "family", "together", "meet",
        "communicate", "discuss", "agree", "disagree", "support", "trust",
        "cooperate", "relationship", "social", "partner", "colleague",
        # Chinese
        "朋友", "聊天", "分享", "帮助", "他们", "大家", "人们",
        "团队", "社区", "家庭", "一起", "见面", "交流", "讨论",
        "同意", "信任", "合作", "关系", "伙伴", "同事", "集体",
        "相处", "沟通", "社会",
    },
    # --- Temporal: past ---
    "temporal_past": {
        # English
        "was", "were", "had", "did", "went", "said", "ago", "before",
        "yesterday", "previously", "formerly", "once", "used",
        "remembered", "recalled", "earlier", "past",
        # Chinese
        "了", "过", "曾经", "以前", "昨天", "前天", "过去", "当初",
        "从前", "原来", "当时", "之前", "已经", "刚才",
    },
    # --- Temporal: present ---
    "temporal_present": {
        # English
        "is", "are", "am", "now", "today", "currently", "being",
        "right now", "present", "existing", "ongoing", "at the moment",
        # Chinese
        "现在", "目前", "当前", "今天", "正在", "此刻", "眼下", "如今",
    },
    # --- Temporal: future ---
    "temporal_future": {
        # English
        "will", "shall", "going to", "tomorrow", "soon", "plan",
        "intend", "expect", "hope", "predict", "next", "future",
        "upcoming", "eventually",
        # Chinese
        "将", "将要", "会", "打算", "明天", "未来", "以后", "即将",
        "后天", "计划", "准备", "预计",
    },
    # --- First person singular ---
    "first_person_singular": {
        # English
        "i", "me", "my", "mine", "myself",
        # Chinese
        "我", "我的", "自己",
    },
    # --- First person plural ---
    "first_person_plural": {
        # English
        "we", "us", "our", "ours", "ourselves",
        # Chinese
        "我们", "咱们", "我们的", "咱",
    },
    # --- Achievement ---
    "achievement": {
        # English
        "win", "success", "achieve", "accomplish", "goal", "earn",
        "award", "honor", "triumph", "master", "excel", "progress",
        "improve", "overcome", "complete", "finish", "attain", "best",
        "champion", "victory", "strive", "effort", "compete",
        # Chinese
        "成功", "胜利", "赢", "达到", "完成", "成就", "获得",
        "奖励", "荣誉", "进步", "提高", "努力", "奋斗", "突破",
        "超越", "卓越", "实现", "目标", "拼搏", "竞争",
    },
    # --- Power ---
    "power": {
        # English
        "control", "dominate", "command", "authority", "power", "rule",
        "lead", "govern", "enforce", "order", "demand", "force",
        "influence", "superior", "boss", "chief", "king", "master",
        "submit", "obey", "strong", "weak", "dominant",
        # Chinese
        "控制", "统治", "命令", "权力", "权威", "领导", "管理",
        "支配", "强迫", "服从", "影响", "上级", "老板", "主宰",
        "强大", "强势", "威严", "掌握", "指挥", "霸权",
    },
}


def _load_custom_dict(dict_path: Path) -> dict[str, set[str]]:
    """Load a custom LIWC dictionary from a JSON file.

    Expected format::

        {
            "dimension_name": ["word1", "word2", ...],
            ...
        }
    """
    with dict_path.open(encoding="utf-8") as fh:
        data = json.load(fh)

    result: dict[str, set[str]] = {}
    for dim, words in data.items():
        if not isinstance(words, list):
            logger.warning("Skipping non-list value for LIWC dimension '%s'", dim)
            continue
        result[dim] = {w.lower() for w in words if isinstance(w, str)}
    return result


# Pre-compiled regex for CJK character detection
_CJK_RE = re.compile(
    r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff"
    r"\U00020000-\U0002a6df\U0002a700-\U0002b73f"
    r"\U0002b740-\U0002b81f\U0002b820-\U0002ceaf]"
)


def _is_cjk_token(token: str) -> bool:
    """Return True if the token consists entirely of CJK characters."""
    return bool(token) and all(_CJK_RE.match(ch) for ch in token)


class LiwcAnalyzer:
    """Lightweight LIWC-style dimension scorer."""

    def __init__(self, dict_path: Path | None = None) -> None:
        if dict_path is not None:
            dict_path = Path(dict_path)
            if not dict_path.exists():
                raise FileNotFoundError(f"LIWC dictionary not found: {dict_path}")
            self._dict = _load_custom_dict(dict_path)
            logger.info("Loaded custom LIWC dictionary from %s (%d dimensions)", dict_path, len(self._dict))
        else:
            self._dict = _BUILTIN_DICT
            logger.debug("Using built-in LIWC dictionary (%d dimensions)", len(self._dict))

    @property
    def dimensions(self) -> list[str]:
        """Return the list of available dimension names."""
        return sorted(self._dict.keys())

    def analyze(self, tokens: list[str]) -> dict[str, float]:
        """Compute LIWC dimension scores for a list of tokens.

        Each dimension score is the proportion of tokens that match the
        dimension's word list (value in [0.0, 1.0]).

        For CJK text, individual characters in a token are also checked
        against the dictionary, since Chinese "words" in the dictionary
        may be substrings of longer tokens.
        """
        if not tokens:
            return {dim: 0.0 for dim in self._dict}

        total = len(tokens)
        counts: dict[str, int] = {dim: 0 for dim in self._dict}
        lower_tokens = [t.lower() for t in tokens]

        for token in lower_tokens:
            for dim, wordset in self._dict.items():
                # Exact match
                if token in wordset:
                    counts[dim] += 1
                    continue
                # For CJK: check if any dictionary entry is a substring of the
                # token, or if the token is a substring of a dictionary entry.
                # This handles cases like token="想到" matching dict word "想".
                if _CJK_RE.search(token):
                    for word in wordset:
                        if len(word) > 1 and (word in token or token in word):
                            counts[dim] += 1
                            break

        return {dim: count / total for dim, count in counts.items()}
