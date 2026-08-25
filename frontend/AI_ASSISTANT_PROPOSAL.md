# Đề xuất xây dựng trợ lý AI trong tab AI (ChatContactPanel)

## Phân tích knowledge base hiện có

Anh đã có bộ KB rất đầy đủ tại `D:\CTY TNHH THIEP CUOI\CLAUDE\botcake\Botcake_AI_Pack_v1`:
- SystemPrompt chi tiết (vai trò, quy tắc hội thoại, logic thu thập thông tin)
- Bảng giá 2 nhóm A/B, giá cố định, nhóm cần gọi hotline
- FAQ, Sales Rules, Product catalog, Quick Reply
- 100 test cases đã chuẩn hóa

Đây là bộ KB **đã được design cho chatbot chăm sóc KH**, chỉ cần tích hợp vào ZaloCRM.

---

## Model API nên dùng

Theo yêu cầu: **ngôn ngữ tự nhiên tiếng Việt + giải quyết CSKH tốt**, em đề xuất 3 lựa chọn ưu tiên:

### 1. **OpenAI GPT-4o** (khuyên dùng)
**Lý do:**
- Hiểu tiếng Việt tự nhiên tốt nhất (GPT-4 Turbo / GPT-4o)
- Tuân thủ system prompt nghiêm ngặt → không bịa giá, không hallucinate khi đã rào chắn trong KB
- RAG (Retrieval-Augmented Generation) tốt → có thể embed KB Excel vào vector store (OpenAI Embeddings) hoặc gửi trực tiếp trong context nếu KB ngắn
- Pricing hợp lý: ~0.5¢/1K tokens (gpt-4o-mini) hoặc ~1.5¢/1K (gpt-4o standard) — cho CSKH thiệp cưới mỗi hội thoại ~3-5K tokens → $0.015-0.075/conversation
- API ổn định, có vision (nếu sau này cần AI nhận diện ảnh thiệp khách gửi)

**Điểm trừ:** cần VPN/proxy nếu OpenAI chặn VN (nhưng hiện tại OpenAI API vẫn hoạt động bình thường từ VN)

---

### 2. **Anthropic Claude 3.5 Sonnet / Claude Opus**
**Lý do:**
- Hiểu tiếng Việt tốt (Sonnet 3.5 ≈ GPT-4o)
- **Xuất sắc trong tuân thủ hướng dẫn dài** (SystemPrompt 129 dòng của anh → Claude xử lý tốt hơn GPT)
- Context window lớn (200K tokens) → có thể nhét toàn bộ KB vào system prompt thay vì RAG
- Giá tương đương GPT-4o: $3/MTok input, $15/MTok output (Sonnet 3.5)
- Không bị chặn ở VN

**Điểm trừ:** ít người dùng hơn OpenAI → ít tài liệu community, nhưng chất lượng đảm bảo

---

### 3. **Google Gemini 1.5 Pro / Flash**
**Lý do:**
- Hiểu tiếng Việt native (Google có tập dữ liệu VN lớn)
- Context window khổng lồ (1M tokens Gemini 1.5 Pro, 2M Flash) → nhét cả KB + lịch sử chat dài không lo
- **Rẻ nhất:** Gemini 1.5 Flash chỉ $0.075/1M input, $0.30/1M output → gần như free cho use case CSKH
- API không bị chặn VN

**Điểm trừ:**
- Tuân thủ system prompt **kém hơn** GPT-4o/Claude → dễ bị "creative" khi KB không rõ ràng (nhưng KB của anh đã rào chắn kỹ nên có thể dùng được)
- Chất lượng ngôn ngữ tự nhiên hơi "máy móc" hơn GPT-4o một chút

---

## Khuyến nghị cuối

| Tiêu chí | OpenAI GPT-4o | Claude Sonnet 3.5 | Gemini 1.5 Flash |
|---|---|---|---|
| Ngôn ngữ tự nhiên tiếng Việt | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Tuân thủ quy tắc KB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Giá thành | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Độ phổ biến / tài liệu | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Context window | 128K | 200K | 2M |

**Kết luận:**
- Nếu ưu tiên **chất lượng hội thoại + tuân thủ KB nghiêm ngặt** → **OpenAI GPT-4o** (hoặc Claude Sonnet 3.5 nếu muốn context dài hơn)
- Nếu ưu tiên **chi phí thấp** và KB đã rào chắn tốt → **Gemini 1.5 Flash**

Em đề xuất bắt đầu với **GPT-4o-mini** (rẻ, nhanh, đủ tốt cho CSKH) → nếu cần nâng cấp thì lên GPT-4o standard.

---

## Kiến trúc kỹ thuật

### Backend (Fastify)
1. Tạo route mới: `POST /ai/chat`
   - Input: `{ contactId, messages: [{role, content}], conversationContext? }`
   - Gọi OpenAI API (hoặc Claude/Gemini) với:
     - System prompt = `06_SystemPrompt.md`
     - Context = KB từ Excel (embed hoặc concat)
     - Messages = lịch sử chat
   - Output: `{ reply: string, usage: {tokens, cost} }`

2. Vector store cho KB (nếu dùng RAG):
   - Dùng Prisma lưu embeddings của KB vào Postgres (pgvector extension)
   - Hoặc dùng in-memory (nếu KB nhỏ ~700 dòng thì < 200KB → load trực tiếp vào RAM)

3. Rate limit: giới hạn 10 msg/phút/contact để tránh spam

### Frontend (Vue 3)
1. Tab AI trong ChatContactPanel:
   - Giao diện chat đơn giản (input + danh sách bubble messages)
   - Nút "Chèn vào tin nhắn" để copy reply AI → ô soạn tin (dùng `chat:insert-suggestion`)
   - Hiển thị typing indicator khi đang gọi API
   - Context toggle: "Dùng thông tin KH" (tên, lịch sử mua hàng từ orders) → gửi lên backend

2. Style: tone xanh #2f80ed như tab BÁO GIÁ

---

## Câu hỏi cần xác nhận trước khi code

1. **API key nào anh muốn dùng?** (GPT-4o / Claude / Gemini — em khuyên GPT-4o-mini)
2. **KB nạp như thế nào?**
   - Option A: Parse Excel → lưu Postgres → RAG vector search (phức tạp, tốt cho KB lớn)
   - Option B: Load Excel vào RAM → concat vào system prompt (đơn giản, đủ cho 700 dòng)
3. **Lịch sử chat AI lưu ở đâu?**
   - Lưu vào DB (`ai_conversations` table) để audit/training sau này?
   - Hay chỉ giữ client-side (localStorage) cho nhanh?
4. **Giới hạn token/phút?** (để tránh spam + tiết kiệm chi phí)

Anh vui lòng cho em biết các quyết định này, em sẽ code ngay.
