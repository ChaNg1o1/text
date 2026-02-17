use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Check if a character belongs to the CJK Unified Ideographs block.
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}'
        | '\u{3400}'..='\u{4DBF}'
        | '\u{F900}'..='\u{FAFF}'
    )
}

/// Check if a character is a Latin letter.
fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || matches!(c,
            '\u{00C0}'..='\u{00FF}' // Latin-1 Supplement
            | '\u{0100}'..='\u{024F}' // Latin Extended-A/B
        )
}

/// Check if a character is an emoji.
///
/// Covers the main emoji ranges in Unicode. This is intentionally a broad
/// heuristic — a full emoji parser would need the Unicode Emoji data tables.
fn is_emoji(c: char) -> bool {
    matches!(c,
        '\u{1F600}'..='\u{1F64F}' // Emoticons
        | '\u{1F300}'..='\u{1F5FF}' // Misc Symbols and Pictographs
        | '\u{1F680}'..='\u{1F6FF}' // Transport and Map
        | '\u{1F1E0}'..='\u{1F1FF}' // Regional Indicator Symbols (flags)
        | '\u{2600}'..='\u{26FF}'   // Misc Symbols
        | '\u{2700}'..='\u{27BF}'   // Dingbats
        | '\u{FE00}'..='\u{FE0F}'   // Variation Selectors
        | '\u{1F900}'..='\u{1F9FF}' // Supplemental Symbols and Pictographs
        | '\u{1FA00}'..='\u{1FA6F}' // Chess Symbols
        | '\u{1FA70}'..='\u{1FAFF}' // Symbols and Pictographs Extended-A
        | '\u{231A}'..='\u{231B}'   // Watch, Hourglass
        | '\u{23E9}'..='\u{23F3}'   // Media control
        | '\u{23F8}'..='\u{23FA}'   // Media control
        | '\u{25AA}'..='\u{25AB}'   // Small squares
        | '\u{25B6}' | '\u{25C0}'   // Play buttons
        | '\u{25FB}'..='\u{25FE}'   // Squares
        | '\u{2934}'..='\u{2935}'   // Arrows
        | '\u{2B05}'..='\u{2B07}'   // Arrows
        | '\u{2B1B}'..='\u{2B1C}'   // Large squares
        | '\u{2B50}' | '\u{2B55}'   // Star, Circle
        | '\u{3030}' | '\u{303D}'   // Wavy dash, Part alternation mark
        | '\u{3297}' | '\u{3299}'   // Circled ideographs
        | '\u{200D}'                 // ZWJ (joins emoji sequences)
        | '\u{20E3}'                 // Combining Enclosing Keycap
    )
}

/// Check if a character is punctuation (broad sense, both ASCII and CJK).
fn is_punctuation(c: char) -> bool {
    c.is_ascii_punctuation()
        || matches!(c,
            '。' | '，' | '！' | '？' | '；' | '：' | '\u{201C}' | '\u{201D}'
            | '\u{2018}' | '\u{2019}'
            | '（' | '）' | '【' | '】' | '《' | '》' | '、' | '…' | '—' | '·'
            | '「' | '」' | '『' | '』' | '〈' | '〉' | '〔' | '〕' | '﹏'
        )
}

/// Unicode analysis metrics.
pub struct UnicodeMetrics {
    pub cjk_ratio: f64,
    pub emoji_density: f64,
    pub code_switching_ratio: f64,
    pub formality_score: f64,
}

/// Compute Unicode profile metrics from the given text.
pub fn compute_unicode_metrics(text: &str) -> UnicodeMetrics {
    if text.is_empty() {
        return UnicodeMetrics {
            cjk_ratio: 0.0,
            emoji_density: 0.0,
            code_switching_ratio: 0.0,
            formality_score: 0.0,
        };
    }

    let chars: Vec<char> = text.chars().collect();
    let total = chars.len() as f64;

    let mut cjk_count: usize = 0;
    let mut emoji_count: usize = 0;

    for &c in &chars {
        if is_cjk(c) {
            cjk_count += 1;
        }
        if is_emoji(c) {
            emoji_count += 1;
        }
    }

    let cjk_ratio = cjk_count as f64 / total;
    let emoji_density = emoji_count as f64 / total;

    let code_switching_ratio = compute_code_switching_ratio(&chars);
    let formality_score = compute_formality_score(text, &chars, emoji_count);

    UnicodeMetrics {
        cjk_ratio,
        emoji_density,
        code_switching_ratio,
        formality_score,
    }
}

/// Compute code-switching ratio: proportion of script transitions relative
/// to total adjacent character pairs (only counting CJK<->Latin transitions).
fn compute_code_switching_ratio(chars: &[char]) -> f64 {
    #[derive(Clone, Copy, PartialEq)]
    enum Script {
        Cjk,
        Latin,
        Other,
    }

    let classified: Vec<Script> = chars
        .iter()
        .map(|&c| {
            if is_cjk(c) {
                Script::Cjk
            } else if is_latin(c) {
                Script::Latin
            } else {
                Script::Other
            }
        })
        .collect();

    // Filter to only CJK or Latin characters to measure transitions between them.
    let script_seq: Vec<Script> = classified
        .into_iter()
        .filter(|s| *s != Script::Other)
        .collect();

    if script_seq.len() < 2 {
        return 0.0;
    }

    let pairs = script_seq.len() - 1;
    let transitions = script_seq
        .windows(2)
        .filter(|w| w[0] != w[1])
        .count();

    transitions as f64 / pairs as f64
}

/// Compute punctuation character frequencies.
/// Returns a map from each punctuation character to its frequency relative to
/// total character count.
pub fn punctuation_profile(text: &str) -> HashMap<String, f64> {
    if text.is_empty() {
        return HashMap::new();
    }

    let total = text.chars().count() as f64;
    let mut counts: FxHashMap<char, u64> = FxHashMap::default();

    for c in text.chars() {
        if is_punctuation(c) {
            *counts.entry(c).or_insert(0) += 1;
        }
    }

    counts
        .into_iter()
        .map(|(c, v)| (c.to_string(), v as f64 / total))
        .collect()
}

/// Heuristic formality score in [0, 1].
///
/// Higher values indicate more formal text. Based on:
/// - Punctuation variety (more diverse punctuation -> more formal)
/// - Emoji usage (more emoji -> less formal)
/// - Abbreviation patterns (presence of common informal markers -> less formal)
/// - Sentence structure (longer average "segments" -> more formal)
fn compute_formality_score(text: &str, chars: &[char], emoji_count: usize) -> f64 {
    let total = chars.len() as f64;
    if total == 0.0 {
        return 0.0;
    }

    // Factor 1: Emoji penalty. More emoji -> less formal.
    // Score component: 1.0 when no emoji, 0.0 when emoji_density >= 0.1.
    let emoji_factor = (1.0 - (emoji_count as f64 / total) * 10.0).max(0.0);

    // Factor 2: Punctuation variety bonus.
    // Diverse punctuation (commas, semicolons, colons) suggests formal writing.
    let mut punct_types: FxHashMap<char, bool> = FxHashMap::default();
    let mut punct_count = 0u64;
    for &c in chars {
        if is_punctuation(c) {
            punct_types.insert(c, true);
            punct_count += 1;
        }
    }
    // Normalize: variety of 5+ distinct punctuation marks -> high formality signal.
    let punct_variety = (punct_types.len() as f64 / 5.0).min(1.0);
    // Also consider punctuation density — some is good, too much (like "!!!") is informal.
    let punct_density = punct_count as f64 / total;
    let punct_factor = punct_variety * (1.0 - (punct_density - 0.05).max(0.0) * 5.0).max(0.0);

    // Factor 3: Informal marker penalty.
    let lower = text.to_lowercase();
    let informal_markers = [
        "lol", "lmao", "omg", "btw", "idk", "imo", "tbh", "smh", "ngl", "brb", "afk",
        "haha", "hehe", "xd", "rofl",
    ];
    let informal_count = informal_markers
        .iter()
        .filter(|&&m| lower.contains(m))
        .count();
    let informal_factor = (1.0 - informal_count as f64 * 0.15).max(0.0);

    // Factor 4: Average word length as a proxy (longer words -> more formal).
    let word_chars: Vec<char> = chars.iter().copied().filter(|c| c.is_alphanumeric() || is_cjk(*c)).collect();
    let word_char_count = word_chars.len() as f64;
    // Rough heuristic: average "word" length above 5 is formal-ish.
    let tokens = crate::lexical::tokenize(text);
    let avg_len = if tokens.is_empty() {
        0.0
    } else {
        word_char_count / tokens.len() as f64
    };
    let length_factor = (avg_len / 6.0).min(1.0);

    // Weighted combination.
    let score = 0.30 * emoji_factor
        + 0.25 * punct_factor
        + 0.20 * informal_factor
        + 0.25 * length_factor;

    score.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cjk_ratio_pure_cjk() {
        let m = compute_unicode_metrics("你好世界");
        assert!((m.cjk_ratio - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_cjk_ratio_pure_english() {
        let m = compute_unicode_metrics("Hello world");
        assert!((m.cjk_ratio - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_cjk_ratio_mixed() {
        // "Hi你好" -> 4 chars, 2 CJK
        let m = compute_unicode_metrics("Hi你好");
        assert!((m.cjk_ratio - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_emoji_density() {
        let m = compute_unicode_metrics("Hello 😀😀");
        // "Hello 😀😀" -> 8 chars (H,e,l,l,o, ,😀,😀), 2 emoji
        assert!(m.emoji_density > 0.0);
    }

    #[test]
    fn test_code_switching() {
        // "Hello你好World" -> transitions: Latin->CJK, CJK->Latin
        let m = compute_unicode_metrics("Hello你好World");
        assert!(m.code_switching_ratio > 0.0);
    }

    #[test]
    fn test_code_switching_no_switch() {
        let m = compute_unicode_metrics("Hello world");
        assert!((m.code_switching_ratio - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_punctuation_profile() {
        let profile = punctuation_profile("Hello, world! Hello, world!");
        assert!(profile.contains_key(","));
        assert!(profile.contains_key("!"));
        assert!(!profile.contains_key("H"));
    }

    #[test]
    fn test_punctuation_profile_cjk() {
        let profile = punctuation_profile("你好。世界！");
        assert!(profile.contains_key("。"));
        assert!(profile.contains_key("！"));
    }

    #[test]
    fn test_formality_with_emoji() {
        let formal = compute_unicode_metrics("This is a formal document with proper punctuation, structure, and vocabulary.");
        let informal = compute_unicode_metrics("lol omg 😀😀😀 haha this is so funny!!! 🤣🤣");
        assert!(formal.formality_score > informal.formality_score);
    }

    #[test]
    fn test_empty() {
        let m = compute_unicode_metrics("");
        assert_eq!(m.cjk_ratio, 0.0);
        assert_eq!(m.emoji_density, 0.0);
        assert_eq!(m.code_switching_ratio, 0.0);
        assert_eq!(m.formality_score, 0.0);
    }
}
