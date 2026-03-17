use super::extract_features;
use rayon::prelude::*;
use std::hint::black_box;

fn benchmark_corpus() -> Vec<String> {
    let report = include_str!("../../../sample/analysis_report.md");
    let mut seeds: Vec<String> = report
        .split("\n\n")
        .map(str::trim)
        .filter(|s| s.len() > 80)
        .map(|s| s.replace('\n', " "))
        .collect();

    seeds.extend([
        "The quick brown fox jumps over the lazy dog while stylometric baselines are measured across repeated benchmark samples.",
        "Hello world this benchmark mixes concise English prose with repeated lexical patterns to stress tokenization and n-gram extraction.",
        "你好世界，今天天气很好，我们正在进行一个多语言文本特征提取基准测试，用于优化分词、句法统计和Unicode分析。",
        "Mixed 英文 和 中文 text with emoji 😀😄 plus punctuation!!! This helps exercise code-switching, emoji density, and punctuation profiles.",
        "Formal writing often contains semicolons, commas, and subordinate clauses; informal writing adds emojis 😂 and abbreviations like lol or btw.",
        "作者风格识别通常依赖词汇丰富度、句长分布、功能词比例、字符n-gram指纹以及跨文本一致性等特征。",
    ].into_iter().map(str::to_string));

    assert!(!seeds.is_empty(), "benchmark seed corpus must not be empty");

    let mut corpus = Vec::with_capacity(96);
    for idx in 0..96 {
        let base = &seeds[idx % seeds.len()];
        let variant = match idx % 4 {
            0 => format!("{base} {base}"),
            1 => format!("{base} -- sample #{idx}: repeated punctuation?!"),
            2 => format!("{base} Mixed 编号{idx} with extra CJK tokens and emoji 😀."),
            _ => format!("Benchmark run {idx}: {base} Additional trailing sentence for variability."),
        };
        corpus.push(variant);
    }
    corpus
}

#[test]
#[ignore = "benchmark"]
fn perf_batch_extract_benchmark() {
    let corpus = benchmark_corpus();
    let total_chars: usize = corpus.iter().map(|s| s.len()).sum();

    let warmup_tokens: usize = corpus
        .par_iter()
        .map(|text| black_box(extract_features(text)).token_count)
        .sum();
    assert!(warmup_tokens > 0);

    let runs = 15usize;
    let mut samples_ms = Vec::with_capacity(runs);
    let mut checksum = 0usize;

    for _ in 0..runs {
        let start = std::time::Instant::now();
        let token_sum: usize = corpus
            .par_iter()
            .map(|text| black_box(extract_features(text)).token_count)
            .sum();
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
        samples_ms.push(elapsed_ms);
        checksum ^= token_sum;
    }

    samples_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_ms = samples_ms[runs / 2];
    let best_ms = samples_ms[0];
    let p90_index = ((runs as f64 * 0.9).floor() as usize).min(runs - 1);
    let p90_ms = samples_ms[p90_index];

    println!("METRIC total_ms={median_ms:.3}");
    println!("METRIC best_ms={best_ms:.3}");
    println!("METRIC p90_ms={p90_ms:.3}");
    println!("METRIC texts={}", corpus.len());
    println!("METRIC total_chars={total_chars}");
    println!("METRIC checksum={checksum}");
}
