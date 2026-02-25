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
    pub brunets_w: f64,
    pub honores_r: f64,
    pub simpsons_d: f64,
    pub mtld: f64,
    pub hd_d: f64,
}

/// Compute lexical richness metrics from the given text.
pub fn compute_lexical_metrics(text: &str) -> LexicalMetrics {
    let tokens = tokenize(text);
    compute_lexical_metrics_from_tokens(&tokens)
}

/// Compute lexical richness metrics from pre-tokenized input.
pub fn compute_lexical_metrics_from_tokens(tokens: &[String]) -> LexicalMetrics {
    let token_count = tokens.len();

    if token_count == 0 {
        return LexicalMetrics {
            token_count: 0,
            type_token_ratio: 0.0,
            hapax_legomena_ratio: 0.0,
            yules_k: 0.0,
            avg_word_length: 0.0,
            brunets_w: 0.0,
            honores_r: 0.0,
            simpsons_d: 0.0,
            mtld: 0.0,
            hd_d: 0.0,
        };
    }

    // Build frequency map.
    let mut freq: FxHashMap<&str, u64> = FxHashMap::default();
    for tok in tokens {
        *freq.entry(tok.as_str()).or_insert(0) += 1;
    }

    let type_count = freq.len();
    let n = token_count as f64;
    let v = type_count as f64;

    // TTR
    let type_token_ratio = v / n;

    // Hapax legomena: words appearing exactly once.
    let hapax_count = freq.values().filter(|&&c| c == 1).count();
    let hapax_legomena_ratio = if type_count > 0 {
        hapax_count as f64 / v
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

    // Brunet's W = N^(V^-0.172)
    let brunets_w = if v > 0.0 {
        n.powf(v.powf(-0.172))
    } else {
        0.0
    };

    // Honore's R = 100 * ln(N) / (1 - V1/V)
    let honores_r = {
        let v1_ratio = hapax_count as f64 / v;
        if v > 0.0 && (1.0 - v1_ratio).abs() > 1e-10 {
            100.0 * n.ln() / (1.0 - v1_ratio)
        } else {
            0.0
        }
    };

    // Simpson's D = Σ(n_i * (n_i - 1)) / (N * (N - 1))
    let simpsons_d = if n > 1.0 {
        let sum_ni: f64 = freq.values().map(|&f| {
            let fi = f as f64;
            fi * (fi - 1.0)
        }).sum();
        sum_ni / (n * (n - 1.0))
    } else {
        0.0
    };

    // MTLD (Mean Textual Lexical Diversity)
    let mtld = compute_mtld(tokens);

    // HD-D (Hypergeometric Distribution D)
    let hd_d = compute_hd_d(&freq, token_count);

    LexicalMetrics {
        token_count,
        type_token_ratio,
        hapax_legomena_ratio,
        yules_k,
        avg_word_length,
        brunets_w,
        honores_r,
        simpsons_d,
        mtld,
        hd_d,
    }
}

/// Compute function word frequencies from the given text.
/// Returns a map from function word -> normalized frequency (count / total tokens).
#[allow(dead_code)]
pub fn function_word_frequencies(text: &str) -> HashMap<String, f64> {
    let tokens = tokenize(text);
    function_word_frequencies_from_tokens(&tokens)
}

/// Compute function word frequencies from pre-tokenized input.
pub fn function_word_frequencies_from_tokens(tokens: &[String]) -> HashMap<String, f64> {
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

    for tok in tokens {
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

/// MTLD threshold: when running TTR drops below this, one "factor" is counted.
const MTLD_THRESHOLD: f64 = 0.72;

/// Compute MTLD in one direction (forward or reversed token sequence).
fn mtld_one_pass(tokens: &[String]) -> f64 {
    if tokens.is_empty() {
        return 0.0;
    }

    let mut factors: f64 = 0.0;
    let mut types: FxHashMap<&str, u64> = FxHashMap::default();
    let mut token_count: usize = 0;

    for tok in tokens {
        *types.entry(tok.as_str()).or_insert(0) += 1;
        token_count += 1;
        let ttr = types.len() as f64 / token_count as f64;
        if ttr <= MTLD_THRESHOLD {
            factors += 1.0;
            types.clear();
            token_count = 0;
        }
    }

    // Add partial factor for remaining tokens.
    if token_count > 0 {
        let ttr = types.len() as f64 / token_count as f64;
        if ttr < 1.0 {
            factors += (1.0 - ttr) / (1.0 - MTLD_THRESHOLD);
        }
    }

    if factors > 0.0 {
        tokens.len() as f64 / factors
    } else {
        tokens.len() as f64
    }
}

/// Compute MTLD (Mean Textual Lexical Diversity).
/// Average of forward and backward passes.
fn compute_mtld(tokens: &[String]) -> f64 {
    if tokens.len() < 10 {
        return 0.0;
    }
    let forward = mtld_one_pass(tokens);
    let reversed: Vec<String> = tokens.iter().rev().cloned().collect();
    let backward = mtld_one_pass(&reversed);
    (forward + backward) / 2.0
}

/// HD-D sample size (conventional value from McCarthy & Jarvis 2010).
const HDD_SAMPLE_SIZE: usize = 42;

/// Compute log of binomial coefficient C(n, k) using the log-gamma function.
fn ln_binom(n: usize, k: usize) -> f64 {
    if k > n {
        return f64::NEG_INFINITY;
    }
    ln_gamma(n + 1) - ln_gamma(k + 1) - ln_gamma(n - k + 1)
}

/// Stirling's approximation of ln(Gamma(n)) for integer argument = ln((n-1)!).
fn ln_gamma(n: usize) -> f64 {
    if n <= 1 {
        return 0.0;
    }
    // Use iterative log sum for small n to avoid float precision issues.
    if n <= 100 {
        let mut s = 0.0_f64;
        for i in 2..n {
            s += (i as f64).ln();
        }
        return s;
    }
    // Stirling for large n.
    let nf = n as f64 - 1.0;
    nf * nf.ln() - nf + 0.5 * (2.0 * std::f64::consts::PI * nf).ln()
}

/// Compute HD-D (Hypergeometric Distribution D).
/// For each type, compute the probability of seeing it in a random sample of
/// HDD_SAMPLE_SIZE tokens, then average.
fn compute_hd_d(freq: &FxHashMap<&str, u64>, n: usize) -> f64 {
    if n < HDD_SAMPLE_SIZE || freq.is_empty() {
        return 0.0;
    }

    let sample = HDD_SAMPLE_SIZE;
    let mut sum_contrib = 0.0_f64;

    for &fi in freq.values() {
        let fi = fi as usize;
        // P(X >= 1) = 1 - P(X = 0) where X ~ Hypergeometric(N, fi, sample)
        // P(X=0) = C(fi, 0) * C(N-fi, sample) / C(N, sample)
        //        = C(N-fi, sample) / C(N, sample)
        let ln_p0 = ln_binom(n - fi, sample) - ln_binom(n, sample);
        let p_at_least_one = 1.0 - ln_p0.exp();
        sum_contrib += p_at_least_one;
    }

    sum_contrib / sample as f64
}

/// Compute Coleman-Liau readability index.
/// CLI = 0.0588 * L - 0.296 * S - 15.8
/// where L = avg letters per 100 words, S = avg sentences per 100 words.
pub fn coleman_liau_index(letter_count: usize, word_count: usize, sentence_count: usize) -> f64 {
    if word_count == 0 {
        return 0.0;
    }
    let wf = word_count as f64;
    let l = letter_count as f64 / wf * 100.0;
    let s = sentence_count as f64 / wf * 100.0;
    0.0588 * l - 0.296 * s - 15.8
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
