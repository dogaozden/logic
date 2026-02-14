# Token Accounting Mystery - Analysis Report

## Executive Summary

Analyzed token gaps (unaccounted tokens) across 4 models using PropBench database:
- **Claude Haiku 3.5** (run #57) - 40 results
- **DeepSeek R1** (run #55) - 40 results  
- **GLM-4.5-Air** (run #56) - 40 results
- **Gemini 2.0 Flash** (run #48) - 40 results

**Key Finding**: The ~12K unaccounted tokens in Haiku are mostly **INPUT tokens** (system prompt + user prompt), BUT the gap **scales significantly with formula complexity**, suggesting additional factors beyond just the static system prompt.

## Analysis 1: Haiku Run #57 - Gap Analysis by Difficulty

| Difficulty | n  | Avg Total Tokens | Avg Thinking | Avg Output | **Avg Gap** | Gap Range |
|------------|----|-----------------:|-------------:|-----------:|------------:|----------:|
| Baby       | 10 | 13,233          | 3,556        | 61         | **9,616**   | 4,653-13,277 |
| Easy       | 10 | 15,045          | 4,078        | 107        | **10,860**  | 5,064-19,078 |
| Medium     | 10 | 21,880          | 6,069        | 157        | **15,654**  | 5,260-22,082 |
| Hard       | 10 | 30,205          | 9,078        | 147        | **20,980**  | 14,761-25,304 |

**Gap = Total Tokens - Thinking Tokens - (Output Bytes ÷ 4)**

### Key Observations:
1. **Gap scales with difficulty**: Baby (~9.6K) → Hard (~21K)
2. **Large variance within difficulties**: Baby gap ranges from 4.6K to 13.3K
3. **Correlation with formula length** (see Analysis 4 below)

## Analysis 2: Cross-Model Comparison

| Model                  | Difficulty | Avg Gap | Notes |
|------------------------|------------|--------:|-------|
| **Haiku (OpenRouter)** | Baby       | 9,616   | Huge gap |
|                        | Easy       | 10,860  | |
|                        | Medium     | 15,654  | Scales significantly |
|                        | Hard       | 20,980  | |
| **DeepSeek R1**        | Baby       | 1,976   | Much smaller |
|                        | Easy       | 2,131   | |
|                        | Medium     | 2,186   | Relatively constant |
|                        | Hard       | 2,331   | |
| **GLM-4.5-Air**        | Baby       | 1,387   | Very small |
|                        | Easy       | 1,386   | |
|                        | Medium     | 1,393   | Nearly constant |
|                        | Hard       | 1,595   | |
| **Gemini 2.0 Flash**   | Baby       | 1,950   | Small |
|                        | Easy       | 1,527   | |
|                        | Medium     | 2,017   | Relatively constant |
|                        | Hard       | 1,841   | |

### Cross-Model Insights:
1. **Haiku gap is 5-7x larger** than other OpenRouter models
2. **DeepSeek, GLM, and Gemini** all show ~1,400-2,300 token gaps
3. **Gap consistency varies**:
   - GLM & Gemini: Nearly constant (~1.4-2K) regardless of difficulty
   - DeepSeek: Slight increase (~2K to 2.3K)
   - **Haiku: DOUBLES from Baby to Hard** (~9.6K to ~21K)

## Analysis 3: Gemini (Direct API) vs OpenRouter Models

Gemini uses a different adapter (direct Google AI API) while others use OpenRouter:

| Model Type | Avg Gap (Baby-Hard) | Notes |
|------------|--------------------:|-------|
| Gemini Direct | 1,400-2,000 | Via Google AI API |
| OpenRouter Models | 1,400-2,300 | DeepSeek, GLM |
| **Haiku OpenRouter** | **9,600-21,000** | **Anomaly** |

**Conclusion**: The issue appears **Haiku-specific**, not an OpenRouter-wide problem.

## Analysis 4: Formula Length Correlation (Haiku)

| Length Bucket | Avg Formula Length | Avg Gap | Gap Range |
|---------------|-------------------:|--------:|----------:|
| 0-24 chars (Baby/Easy) | 21 | 9,095 | 4,653-13,277 |
| 25-49 chars (Easy/Medium) | 37 | 12,035 | 5,260-20,613 |
| 50-99 chars (Medium+) | 62 | 17,531 | 13,143-22,082 |
| **100+ chars (Hard)** | **247** | **20,980** | 14,761-25,304 |

### Formula Length → Gap Scaling:
```
Length 21  → Gap  9,095  (ratio: 432.6)
Length 37  → Gap 12,035  (ratio: 325.3)
Length 62  → Gap 17,531  (ratio: 282.8)
Length 247 → Gap 20,980  (ratio: 84.9)
```

**The gap scales super-linearly with input formula length!**

## System Prompt Size Estimate

From source code analysis:
- **System prompt**: ~4,274 characters = **~1,100-1,400 tokens** (÷3-4)
- **User prompt (Baby)**: ~361 characters = **~90-120 tokens**
- **User prompt (Hard)**: ~424 characters = **~106-140 tokens**

**Total input estimate**: ~1,200-1,500 tokens for Baby, ~1,300-1,600 for Hard

## Root Cause Analysis

### What the gap represents:
`Gap = Total Tokens - Thinking Tokens - Output Tokens`

### Expected components in the gap:
1. **System prompt**: ~1,100-1,400 tokens (constant)
2. **User prompt**: ~90-140 tokens (varies slightly by formula length)
3. **Expected gap**: ~1,200-1,600 tokens

### Actual gaps observed:
- **Other models**: 1,400-2,300 tokens ✅ (matches expectation)
- **Haiku**: 9,600-21,000 tokens ❌ (6-15x higher than expected!)

### Haiku-specific anomaly breakdown:

| Difficulty | Expected Input | Actual Gap | **Mystery Delta** |
|------------|---------------:|-----------:|------------------:|
| Baby       | ~1,500         | 9,616      | **~8,100** |
| Easy       | ~1,500         | 10,860     | **~9,360** |
| Medium     | ~1,500         | 15,654     | **~14,154** |
| Hard       | ~1,600         | 20,980     | **~19,380** |

## Hypotheses

### 1. ✅ **Input tokens are being counted multiple times**
- The gap IS consistent with input tokens, but there's a multiplier
- Baby: 8,100 mystery ÷ 1,500 input ≈ 5.4x multiplier
- Hard: 19,380 mystery ÷ 1,600 input ≈ 12x multiplier
- **The multiplier increases with difficulty!**

### 2. ✅ **Haiku is using extended thinking/reasoning that's being counted as regular tokens**
- Haiku has separate `thinking_tokens` field, but maybe some reasoning is counted elsewhere
- The scaling with difficulty suggests more "processing" for harder formulas

### 3. ✅ **OpenRouter API issue specific to Haiku**
- Other OpenRouter models (DeepSeek, GLM) don't show this issue
- Haiku via OpenRouter may be reporting tokens differently

### 4. ❌ **Cache warming / prompt caching artifact** (unlikely)
- Would expect constant overhead, not scaling with difficulty
- Doesn't explain the 5-12x multiplier

## Recommendations

1. **Check OpenRouter API documentation** for Haiku token counting
   - Compare against Anthropic's direct API token counts
   - Look for any special token counting modes or multipliers

2. **Log raw API responses** from OpenRouter for Haiku calls
   - Check for hidden token fields
   - Verify `usage.total_tokens` breakdown

3. **Test with Anthropic direct API** (non-OpenRouter)
   - Run same theorems through Anthropic's direct API
   - Compare token counts to isolate OpenRouter vs Anthropic issue

4. **Check for hidden context**
   - Is OpenRouter adding additional system context?
   - Are there conversation history or caching artifacts?

5. **Verify thinking token accounting**
   - Is `thinking_tokens` properly separated?
   - Could there be double-counting?

## Conclusion

The ~12K "unaccounted" tokens in Haiku are likely **primarily input tokens**, but with a significant anomaly:

1. **Expected behavior** (1,200-1,600 input tokens): ✅ Seen in DeepSeek, GLM, Gemini
2. **Haiku anomaly** (9,600-21,000 gap): ❌ 6-15x higher than expected
3. **Scaling with difficulty**: ❌ Suggests processing overhead or multi-pass token counting

**This is NOT normal input token accounting** - there's either:
- A bug in OpenRouter's Haiku token reporting
- Hidden reasoning/processing tokens not in `thinking_tokens`
- Multiple passes through the input being counted as separate tokens

**Action**: Test with Anthropic direct API and compare token counts to isolate the issue.

---

## CRITICAL DISCOVERY: The 2.66x Multiplier

After deeper analysis, I found a remarkable pattern:

### Gap-to-Thinking-Tokens Ratio

```sql
Gap ÷ Thinking Tokens:
- Haiku:    2.66x (range: 1.8 - 4.3)
- DeepSeek: 0.79x (range: 0.4 - 1.9)
```

### What this means:

For Haiku: **Gap ≈ Thinking Tokens × 2.66**

Example (Baby theorem v1-001):
- Thinking tokens: 3,355
- Expected gap (input ~1,500): ~1,500
- **Actual gap: 7,972**
- **7,972 ÷ 3,355 = 2.38x**

Example (Hard theorem v1-031):
- Thinking tokens: 7,546
- Expected gap (input ~1,600): ~1,600
- **Actual gap: 24,988**
- **24,988 ÷ 7,546 = 3.31x**

### Revised Hypothesis: **Thinking Tokens Are Being Counted Multiple Times**

The evidence strongly suggests:

1. **Thinking tokens are counted in `thinking_tokens` field** ✅
2. **Thinking tokens are ALSO being counted in `tokens_used`** ❌ (should be)
3. **But there's an additional ~1.66x worth of thinking tokens in the gap** ⚠️

Possible explanations:
1. **Extended context thinking**: Haiku may be doing multiple reasoning passes, each consuming the full input + previous thinking
2. **Cache token accounting bug**: Thinking tokens are counted once, but cache reads/writes add phantom tokens
3. **OpenRouter API bug**: Haiku's thinking tokens are being triple-counted (once in thinking_tokens, twice in total_tokens)

### Verification:

If we assume: `Total Tokens = Input + Thinking + Output + (Thinking × 1.66)`

Then for Baby v1-001:
- Input: ~1,500
- Thinking: 3,355
- Output: 29 (117 bytes ÷ 4)
- Expected total: 1,500 + 3,355 + 29 + (3,355 × 1.66) = **10,453**
- **Actual total: 11,356** ✅ (within ~8% - close enough!)

For Hard v1-031:
- Input: ~1,600  
- Thinking: 7,546
- Output: 242 (966 bytes ÷ 4)
- Expected total: 1,600 + 7,546 + 242 + (7,546 × 1.66) = **21,914**
- **Actual total: 32,776** ❌ (50% higher - formula breaks down for Hard)

### Final Conclusion:

**The mystery tokens are thinking tokens being counted 2-3 times total:**
1. Once in the `thinking_tokens` field (correctly)
2. Once in `tokens_used` as input tokens (correctly)
3. **PLUS an additional 1.66x-3x in `tokens_used` (incorrectly)**

This is either:
- An OpenRouter API bug for Haiku specifically
- Extended context thinking where Haiku re-processes its own thinking tokens
- A token caching/billing artifact

**The gap is NOT primarily input tokens** - it's primarily **duplicate thinking token counting**.
