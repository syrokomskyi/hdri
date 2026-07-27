Вот полная инструкция для AI — разобрана по корневым причинам с конкретными фиксами.

***

## Диагностика: Три корневые причины

Анализ CSV + кода выявил три независимых источника проблемы: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/0618ab4c-f7f3-460b-822c-f6601bcc0d48/Work-with-unclassified-industries-Germany-Arkush6.csv?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=QD39%2FbCTIbSTjELUjZiWmFupvZY%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

### Причина 1 — Пробел в `BRANCHE_KEYWORD_MAP` для `elektrohandwerk`
`BRANCHE_KEYWORD_MAP` содержит `elektriker`, `elektrobetrieb`, `elektrotechnik` — но ни одно из этих слов **не является подстрокой** `elektrohandwerk`. Нет совпадения → ~150+ строк с очевидным `ShkElektro` остаются unclassified. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/29363ae5-32e1-4c52-bf81-36ad69b2f13d/branche-mapping-2.ts?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=hPVQuVmTont54Sv0hJ2%2FUXqs8qg%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

### Причина 2 — `TITLE_DOMAIN_KEYWORD_MAP` слишком мала для `bauelemente`-компаний
Для `bauelemente` (он в `WEAK_RAW_BRANCHES`) классификатор переходит к `TITLE_DOMAIN_KEYWORD_MAP`, но там **отсутствуют** ключевые торговые термины: `schlosserei`, `glaserei`, `glaser`, `glasbau`, `zimmerei`, `zimmerer`, `tischler` (без суффикса `-ei`), `dachdecker`, `sonnenschutz`, `toranlagen`. Поэтому `schlosserei-rueter.de`, `glasereibley.de`, `zimmerei-priess.de` → unclassified. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/0618ab4c-f7f3-460b-822c-f6601bcc0d48/Work-with-unclassified-industries-Germany-Arkush6.csv?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=QD39%2FbCTIbSTjELUjZiWmFupvZY%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

### Причина 3 — Название компании (3-я колонка CSV) не является отдельным сигналом
В `BrancheClassificationInput` есть только `siteTitle` и `domain`. Название компании из директории — это сильнейший сигнал ("Glaserei Bley", "Tischlermeister ROST"), но он или не передаётся, или объединён с `siteTitle` без гарантий. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/868c49e3-c957-44f0-9fa8-93e0eed1cdbd/classify-3.ts?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=hJesmijj%2BgB6wOmBJhuOkq5q6As%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

***

## Архитектурные изменения (инструкция для AI)

### Изменение 1 — Добавить `companyName` в `BrancheClassificationInput`

```typescript
export type BrancheClassificationInput = {
  rawBranche?: string | null;
  siteTitle?: string | null;
  domain?: string | null;
  companyName?: string | null;  // ← НОВОЕ: из директории, отдельно от siteTitle
};
```

### Изменение 2 — Переписать пайплайн в `classifyBrancheFromSignals`

Текущий порядок неоптимален. Новый пайплайн: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/868c49e3-c957-44f0-9fa8-93e0eed1cdbd/classify-3.ts?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=hJesmijj%2BgB6wOmBJhuOkq5q6As%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

| Шаг | Действие |
|-----|----------|
| 1 | `rawBranche` → `IGNORE_RAW_BRANCHES` → пропустить |
| 2 | `rawBranche` → `RAW_BRANCH_ALIAS_MAP` (exact) → результат |
| 3 | `rawBranche` (не WEAK) → `BRANCHE_KEYWORD_MAP` → результат |
| 4 | `siteTitle` → `ALL_SIGNALS_KEYWORD_MAP` → результат ← новый единый список |
| 5 | `companyName` → `ALL_SIGNALS_KEYWORD_MAP` → результат ← **НОВОЕ** |
| 6 | `domain` → `ALL_SIGNALS_KEYWORD_MAP` → результат |
| 7 | `rawBranche` (даже WEAK) → `BRANCHE_KEYWORD_MAP` → последний шанс |
| 8 | `return null` |

### Изменение 3 — Объединить карты в `ALL_SIGNALS_KEYWORD_MAP`

Удалить `TITLE_DOMAIN_KEYWORD_MAP` как отдельный экспорт. Создать `ALL_SIGNALS_KEYWORD_MAP` = слияние `BRANCHE_KEYWORD_MAP` + бывшей `TITLE_DOMAIN_KEYWORD_MAP` + новые ключевые слова ниже. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/29363ae5-32e1-4c52-bf81-36ad69b2f13d/branche-mapping-2.ts?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=hPVQuVmTont54Sv0hJ2%2FUXqs8qg%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

### Изменение 4 — Добавить `-` как разделитель в `matchKeywordList`

```typescript
const parts = raw.split(/[\/,&|\-]/);  // было: /[\/,&|]/
```

Это исправит `"Bauen & Renovieren - Abrissarbeiten"` → разобьёт на части, каждая проверяется отдельно. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/868c49e3-c957-44f0-9fa8-93e0eed1cdbd/classify-3.ts?AWSAccessKeyId=ASIA2F3EMEYERYVES5RP&Signature=hJesmijj%2BgB6wOmBJhuOkq5q6As%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAIaCXVzLWVhc3QtMSJHMEUCID2794715ZG55BTtpO24F6bfX8fLbMvFXb0bec2uUsTJAiEAgqQqKXwEnK9jvT0YcQgZ230toITLtQjkcmSVzlZu%2Fw8q%2FAQIy%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDHgmXPQe6z%2Fy4R2TXirQBOBb1ghDDcu6B3XdUUDttKI%2BKWkl8spv0QH%2FnTvZV9kA1OsnDvwc58bcnWu8Pfoo1yD7BAKH10NuFlrcZdRVukdTlQEZHUkcHXYfQ0wQEkA1uNIpvz%2FgrCekgCbHW58aCf%2FDXTlQMbAB2Ew%2F5qKo%2FZfJlK7wrRU%2BtYeRwYPqj3A%2Fmjh9mAj5zpTJFoVzYPFORWn7pQ73liyvCOlIvim1ndUMz4SG1I1ZcgrbQ4qLR2d5qfpus4QB7FDt6d%2BMimFjtj6FQZuUfUbcaXW7uIalwXVUYd4mNWlt45PVdEW9jKAIbjxbgSLWf81Iqwj38tla9Db83WTEYoRriQ8K8PjMuPE4sab16Imfp4%2FO3UrgoOE%2FrxTfF5x2gqW0iBmdCgPo4LIWOJa3KJDELBkEIoqVW8HaOgvuTfcYfD2z%2BhZL3AFnFdk25Y0AwxPLa%2BRfkSUVdvZOz14m3jeylaboOHgL41WtRbhYStqHTkzidkGbZV6dpLfUf%2FLfCUi%2FN4B0e5m4p%2FWIOEPiwpmfweDv2OmDW3XyqD2%2FKrxQb3uUQ8XpYnYawHzNwYm16ISp2mG%2FjaIYPSwUbtlmd5nqRKaA%2BzWpzg31p72uvy9oetlJ%2F%2BtFWmvnDyzJcZgX%2FFWQxtvSixkFKVGXCEQ1IpHC4ip76M21Q9cbNNUlvEXZJ%2BC9Zk0VkmoY7w%2F3k6851IqKsvWOStOPZpTI2JjDkP2PK2A%2BBlhobce6zyVuIOg0kAS8ncjbgwCNn6UODsP8CAFQ%2FQ16E8QiPYLFcMQU%2BFkuf1oTiCRnsb0w07a%2BzwY6mAEBrw8yakhqzarUfdPjF2oxXsoB%2FsUJA0HtI5arJu1xfiRy%2F7zH0ePTdrcW0DcDUSkkinJ8lsJRdG7tzzo12zMABttJJZD09WVVIVVB6aurVI%2Bts5a9yVorJG1E%2B%2FAWvq1hW6KDhXGRY%2FZs3WUBKh%2BUhtq3WnGkVFDy6fCMoF34PSDW3ZsPo3h%2FhzYlIELU9rnfAK%2BmTdDUNA%3D%3D&Expires=1777312473)

***

## Новые ключевые слова для `ALL_SIGNALS_KEYWORD_MAP`

Порядок важен — специфичные ВЫШЕ общих:

**BauAusbau** (самая большая группа пробелов для `bauelemente`):
- `bauschlosserei` → `BauAusbau` (**выше** общего `schlosserei`)
- `glaserei`, `glaser`, `glasbau` → `BauAusbau`
- `zimmerei`, `zimmerer`, `zimmermeister` → `BauAusbau`
- `dachdecker`, `dachdeckerei`, `bedachungen` → `BauAusbau`
- `toranlagen`, `tortechnik`, `torsystem`, `schutztore` → `BauAusbau`
- `haustuer`, `tuertechnik`, `tueranlage`, `zargen` → `BauAusbau`
- `sonnenschutz`, `markisen` → `BauAusbau`
- `blechdach`, `vordach`, `terrassendach`, `terrassenueberdat` → `BauAusbau`
- `gartenhaus`, `modulbau`, `fertigteile`, `elementebau` → `BauAusbau`
- `abrissarbeiten`, `ausbesserungen`, `bodenbelaege`, `bautrocknung` → `BauAusbau`
- `solarthermie` → `ShkElektro` (особый случай внутри `Bauen & Renovieren`)

**KfzMetall:**
- `schlosserei` → `KfzMetall` (общий fallback, НИЖЕ `bauschlosserei`)
- `metallgestalt`, `metallverarbeit`, `metalltechnik` → `KfzMetall`
- `schaltanlagen`, `schaltschrank`, `anlagentechnik` → `KfzMetall`

**HolzDesign:**
- `tischler`, `schreiner` → `HolzDesign` (без суффикса `-ei`)
- `holzwerkstatt`, `holzbearbeitung`, `holzkunst` → `HolzDesign`

**ShkElektro:**
- `elektrohandw` → `ShkElektro` (**критично!** — самый частый пропущенный термин)
- `gebaeudetechnik`, `haustechnik` → `ShkElektro`
- `notstrom`, `lueftungstech`, `kaeltetech` → `ShkElektro`

***

## Новые записи в `RAW_BRANCH_ALIAS_MAP`

```typescript
// ShkElektro — КРИТИЧНО (сотни строк)
'elektrohandwerk': 'ShkElektro',

// BauAusbau
'bautaetigkeit':          'BauAusbau',
'bautaetigkeiten':        'BauAusbau',
'baugeruest':             'BauAusbau',
'geruestbau':             'BauAusbau',

// Gesundheit
'arzt':                                          'Gesundheit',
'alternative therapie':                          'Gesundheit',
'alternative und komplementaere therapien':      'Gesundheit',
'aerztebedarf':                                  'Gesundheit',
'baeder':                                        'ShkElektro',

// KfzMetall
'anhaenger':              'KfzMetall',

// Dienstleistung
'bausachverstaendiger':   'Dienstleistung',
'berufsgenossenschaft':   'Dienstleistung',
'entruempelungsdienste':  'Dienstleistung',
'abholstelle':            'Dienstleistung',
'abendkurse':             'Dienstleistung',
'altlasten':              'Dienstleistung',

// Kreativ
'antiquitaeten':          'Kreativ',
```

***

## Приоритет реализации

Делать строго в этом порядке — каждый шаг можно сразу проверить на CSV:

1. **`elektrohandwerk` → `RAW_BRANCH_ALIAS_MAP`** — немедленно закрывает ~150+ строк
2. **Добавить `companyName` в input + пайплайн** — раскрывает сигнал для `bauelemente`-компаний
3. **Добавить недостающие термины** (`glaserei`, `zimmerei`, `tischler`, `schlosserei` и т.д.) в `ALL_SIGNALS_KEYWORD_MAP`
4. **`-` как разделитель** в `matchKeywordList` — закрывает серию `Bauen & Renovieren - *`
5. **Все новые alias-записи** из блока выше
6. Прогон через полный CSV и устранение остатков

Полная инструкция сохранена в файл `2-classifier-improvement-instruction.md` для удобства.
