use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// English function words — a common subset used in stylometry.
const ENGLISH_FUNCTION_WORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "if", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had", "do",
    "does", "did", "will", "would", "shall", "should", "may", "might", "must", "can", "could",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each", "every", "all", "any",
    "few", "more", "most", "some", "such", "than", "too", "very", "just", "about", "above",
    "after", "again", "against", "before", "below", "between", "during", "into", "through",
    "under", "until", "up", "down", "out", "off", "over", "then", "once", "here", "there",
    "when", "where", "why", "how", "what", "which", "who", "whom", "this", "that", "these",
    "those", "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
    "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers",
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
];

/// Chinese function words (particles, pronouns, common grammatical words).
const CHINESE_FUNCTION_CHARS: &[char] = &[
    '的', '了', '在', '是', '我', '他', '这', '那', '有', '不', '人', '们', '中', '大',
    '为', '上', '个', '会', '来', '到', '说', '和', '地', '也', '子', '时', '道', '出',
    '要', '于', '而', '又', '把', '被', '让', '给', '从', '向', '往', '以', '所', '就',
    '她', '它', '吗', '呢', '吧', '啊', '哦', '嗯', '与', '或', '但', '却', '都', '还',
    '才', '只', '已', '经', '过', '着', '得',
];

/// Check if a character belongs to the CJK Unified Ideographs block.
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}'
        | '\u{3400}'..='\u{4DBF}'
        | '\u{F900}'..='\u{FAFF}'
    )
}

/// Tokenize text into a list of lowercased word tokens.
///
/// - Whitespace and punctuation separate Latin words.
/// - Each CJK character is emitted as its own token.
pub fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current_word = String::new();

    for c in text.chars() {
        if is_cjk(c) {
            // Flush any accumulated Latin word.
            if !current_word.is_empty() {
                tokens.push(current_word.to_lowercase());
                current_word.clear();
            }
            tokens.push(c.to_string());
        } else if c.is_alphanumeric() || c == '\'' || c == '\u{2019}' {
            // Include apostrophes as part of words (don't, it's).
            current_word.push(c);
        } else {
            // Whitespace, punctuation, etc. — flush current word.
            if !current_word.is_empty() {
                tokens.push(current_word.to_lowercase());
                current_word.clear();
            }
        }
    }

    if !current_word.is_empty() {
        tokens.push(current_word.to_lowercase());
    }

    tokens
}

/// Lexical metrics computed from token frequencies.
pub struct LexicalMetrics {
    pub token_count: usize,
    pub type_token_ratio: f64,
    pub hapax_legomena_ratio: f64,
    pub yules_k: f64,
    pub avg_word_length: f64,
}

/// Compute lexical richness metrics from the given text.
pub fn compute_lexical_metrics(text: &str) -> LexicalMetrics {
    let tokens = tokenize(text);
    let token_count = tokens.len();

    if token_count == 0 {
        return LexicalMetrics {
            token_count: 0,
            type_token_ratio: 0.0,
            hapax_legomena_ratio: 0.0,
            yules_k: 0.0,
            avg_word_length: 0.0,
        };
    }

    // Build frequency map.
    let mut freq: FxHashMap<&str, u64> = FxHashMap::default();
    for tok in &tokens {
        *freq.entry(tok.as_str()).or_insert(0) += 1;
    }

    let type_count = freq.len();
    let n = token_count as f64;

    // TTR
    let type_token_ratio = type_count as f64 / n;

    // Hapax legomena: words appearing exactly once.
    let hapax_count = freq.values().filter(|&&v| v == 1).count();
    let hapax_legomena_ratio = if type_count > 0 {
        hapax_count as f64 / type_count as f64
    } else {
        0.0
    };

    // Yule's K: measures vocabulary diversity.
    // K = 10^4 * (M2 - N) / N^2   where M2 = sum(fi^2), fi = frequency of type i.
    let m2: f64 = freq.values().map(|&f| (f as f64).powi(2)).sum();
    let yules_k = if n > 1.0 {
        1e4 * (m2 - n) / (n * n)
    } else {
        0.0
    };

    // Average word length (in characters).
    let total_chars: usize = tokens.iter().map(|t| t.chars().count()).sum();
    let avg_word_length = total_chars as f64 / n;

    LexicalMetrics {
        token_count,
        type_token_ratio,
        hapax_legomena_ratio,
        yules_k,
        avg_word_length,
    }
}

/// Compute function word frequencies from the given text.
/// Returns a map from function word -> normalized frequency (count / total tokens).
pub fn function_word_frequencies(text: &str) -> HashMap<String, f64> {
    let tokens = tokenize(text);
    let n = tokens.len();
    if n == 0 {
        return HashMap::new();
    }

    // Build a lookup set for English function words.
    let en_set: FxHashMap<&str, ()> = ENGLISH_FUNCTION_WORDS
        .iter()
        .map(|&w| (w, ()))
        .collect();

    // Build a lookup set for Chinese function characters.
    let zh_set: FxHashMap<char, ()> = CHINESE_FUNCTION_CHARS
        .iter()
        .map(|&c| (c, ()))
        .collect();

    let mut counts: FxHashMap<String, u64> = FxHashMap::default();

    for tok in &tokens {
        let is_func = if tok.chars().count() == 1 {
            // Single-char token: check both English and Chinese.
            let c = tok.chars().next().unwrap();
            zh_set.contains_key(&c) || en_set.contains_key(tok.as_str())
        } else {
            en_set.contains_key(tok.as_str())
        };

        if is_func {
            *counts.entry(tok.clone()).or_insert(0) += 1;
        }
    }

    let n_f = n as f64;
    counts
        .into_iter()
        .map(|(k, v)| (k, v as f64 / n_f))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_english() {
        let tokens = tokenize("Hello, world! This is a test.");
        assert_eq!(
            tokens,
            vec!["hello", "world", "this", "is", "a", "test"]
        );
    }

    #[test]
    fn test_tokenize_cjk() {
        let tokens = tokenize("你好世界");
        assert_eq!(tokens, vec!["你", "好", "世", "界"]);
    }

    #[test]
    fn test_tokenize_mixed() {
        let tokens = tokenize("Hello你好world世界");
        assert_eq!(tokens, vec!["hello", "你", "好", "world", "世", "界"]);
    }

    #[test]
    fn test_lexical_metrics_empty() {
        let m = compute_lexical_metrics("");
        assert_eq!(m.token_count, 0);
        assert_eq!(m.type_token_ratio, 0.0);
    }

    #[test]
    fn test_lexical_metrics_basic() {
        let m = compute_lexical_metrics("the the the cat sat on the mat");
        assert_eq!(m.token_count, 8);
        // 5 unique: the, cat, sat, on, mat
        assert!((m.type_token_ratio - 5.0 / 8.0).abs() < 1e-9);
    }

    #[test]
    fn test_hapax_ratio() {
        // "a b c a" -> freq: a=2, b=1, c=1 -> 3 types, 2 hapax -> ratio = 2/3
        let m = compute_lexical_metrics("a b c a");
        assert!((m.hapax_legomena_ratio - 2.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn test_function_words_english() {
        let freq = function_word_frequencies("the cat is on the mat");
        assert!(freq.contains_key("the"));
        assert!(freq.contains_key("is"));
        assert!(freq.contains_key("on"));
        assert!(!freq.contains_key("cat"));
    }

    #[test]
    fn test_function_words_chinese() {
        let freq = function_word_frequencies("我在这里");
        assert!(freq.contains_key("我"));
        assert!(freq.contains_key("在"));
        assert!(freq.contains_key("这"));
    }
}
