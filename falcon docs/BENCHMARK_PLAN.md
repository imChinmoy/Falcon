# FALCON Benchmark and Evaluation Plan

## 1. Why benchmark

FALCON makes two kinds of claims:
1. It can discover code relationships.
2. It can use those relationships to identify potentially affected code.

Both require evaluation. Runtime speed alone is not sufficient.

## 2. Dataset design

Start with:
- Handwritten fixture repositories with known ground truth.
- Small open-source TypeScript repositories with compatible licenses and documented commit pairs.
- Synthetic repositories for stress testing.

Record repository commit SHA, analyzer version, configuration and dataset license.

## 3. Correctness metrics

### Edge precision
Correctly identified edges / all identified edges.

### Edge recall
Correctly identified edges / all labeled expected edges.

### Impact precision
Correctly identified relevant impacted symbols / all reported impacted symbols.

### Impact recall
Correctly identified relevant impacted symbols / all labeled relevant impacted symbols.

Report per relationship type and repository size. Do not combine unlike categories into one misleading number.

## 4. Performance metrics

- Total wall-clock time.
- File discovery time.
- Parse time.
- Resolution time.
- Graph build time.
- Impact traversal time.
- Peak resident memory.
- Cache hit rate (when caching exists).
- Incremental versus full analysis time.

## 5. Baselines

Compare:
- Full repository test suite runtime.
- FALCON-recommended test set runtime.
- Relevant test failures detected by each approach.

A smaller selected test set is not automatically better. Track missed relevant failures and report them prominently.

## 6. Reproducibility

Every benchmark report includes:
- Hardware and OS.
- Node version.
- Repository and commit.
- Analyzer version.
- Configuration.
- Warm/cold cache state.
- Number of repetitions.
- Median and percentile timings where meaningful.

## 7. Reporting

Publish raw data and methodology where licensing permits. Do not present a single accuracy percentage without dataset size, label definition and limitations.
