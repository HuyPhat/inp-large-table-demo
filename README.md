# INP Large Table Demo

Demo so sánh trực tiếp hai cách render bảng lớn (1.000 dòng × 19 cột mỗi trang, trên tập 20.000 dòng) và ảnh hưởng của chúng đến [Interaction to Next Paint (INP)](https://web.dev/articles/inp).

- `/broken`: cách viết phổ biến, mọi dòng nằm trong DOM và re-render khi có bất kỳ state nào đổi.
- `/fixed`: cùng dữ liệu, cùng giao diện, nhưng chỉ render những dòng đang nhìn thấy và chỉ re-render dòng thay đổi.

Thanh công cụ của cả hai trang có đồng hồ INP đọc trực tiếp từ Event Timing API, chia mỗi tương tác thành delay, JS và paint.

## Kết quả

Đo bằng `pnpm measure` trên bản production, Chromium headless, viewport 1440×900. Bảng ghi giá trị trung vị (ms).

| Tương tác | CPU | `/broken` | `/fixed` |
| --- | --- | ---: | ---: |
| Click chọn dòng | Không throttle | 168 | 16 |
| Gõ vào ô lọc | Không throttle | 128 | 24 |
| Click chọn dòng | Chậm 4x | 616 | 16 |
| Gõ vào ô lọc | Chậm 4x | 344 | 24 |

Tương tác chậm nhất khi throttle 4x là 632 ms ở `/broken` và 24 ms ở `/fixed`, tức từ mức "poor" (trên 500 ms) xuống mức "good" (dưới 200 ms). Số node DOM sau khi lọc "acme" giảm từ 6.577 xuống 546.

Số liệu thay đổi theo máy. Observer bỏ qua các event dưới 16 ms, nên những tương tác rất nhanh ở `/fixed` không được tính vào trung vị.

## Nguyên nhân và cách sửa

| Vấn đề ở `/broken` | Cách sửa ở `/fixed` |
| --- | --- |
| Toàn bộ dòng của trang nằm trong DOM | Ảo hóa bằng `@tanstack/react-virtual`, chỉ giữ dòng trong viewport và 5 dòng overscan |
| Chọn một dòng làm mọi dòng re-render | `memo` cho dòng và `useCallback` cho `onSelect`, nên chỉ hai dòng đổi trạng thái được render lại |
| Tạo `Intl.NumberFormat` và `Intl.DateTimeFormat` mới cho từng ô | Mỗi formatter chỉ tạo một lần, formatter tiền tệ được cache theo currency |
| `JSON.stringify` từng dòng ở mỗi phím gõ và mỗi lần chọn | Dựng sẵn chuỗi tìm kiếm bằng `useMemo`, chỉ tính lại khi có dữ liệu mới |
| Table auto layout phải đo mọi ô | CSS grid với cột và dòng có kích thước cố định, trình duyệt không cần đo nội dung |

## Cấu trúc

```text
apps/api              NestJS, GET /rows?page=&pageSize= (cổng 3001, dữ liệu cố định)
apps/web/app/broken   Trang chưa tối ưu
apps/web/app/fixed    Trang đã tối ưu
apps/web/app/shared.tsx   Cột, formatter, useRows, Toolbar, đồng hồ INP
scripts/measure.mjs   Playwright: click và gõ thật, in kết quả Event Timing
apps/stream-web       Thí nghiệm thứ 2 (Vite + React, cổng 5173): cập nhật bảng tần suất cao qua SSE
apps/stream-api       API SSE cho thí nghiệm thứ 2 (NestJS, cổng 3002)
turbo.json            Turborepo điều phối build, dev, start cho cả bốn app
```

Thí nghiệm thứ 2 không dùng chung code với hai app đầu và đang được dựng dần, xem [PLAN-sse-streaming.md](PLAN-sse-streaming.md) (bản tiếng Anh: [PLAN-sse-streaming.en.md](PLAN-sse-streaming.en.md)). Hiện `stream-web` mới chỉ có trang trống với đồng hồ INP và `stream-api` mới chỉ có endpoint `/health`.

Dữ liệu được sinh tất định khi API khởi động, nên mọi lần đo đều chạy trên cùng một tập. `pageSize` tối đa là 1.000.

## Chạy dự án

Cần Node.js và pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

`pnpm start` tự build trước nếu cần (Turborepo cache lại kết quả) rồi chạy cả bốn app. Chỉ muốn chạy thí nghiệm thứ 2 thì dùng `pnpm dev:stream`.

Mở <http://localhost:3000>, trang chủ sẽ chuyển đến `/broken`. Web dùng cổng 3000 và API dùng cổng 3001. API chỉ cho phép CORS từ `http://localhost:3000`.

Để phát triển, dùng `pnpm dev`. Không nên đo INP ở chế độ này vì bản dev của React chậm hơn bản production.

## Đo lại

Giữ `pnpm start` đang chạy, rồi mở terminal khác:

```bash
pnpm exec playwright install chromium   # chỉ cần lần đầu
pnpm measure
```

Script click 5 dòng và gõ "acme" vào ô lọc trên từng trang, ở mức CPU bình thường và chậm 4 lần. Mỗi dòng JSON in ra gồm số tương tác, trung vị, giá trị chậm nhất và phần JS, paint của click và phím gõ.

## Giới hạn

Ô lọc chỉ tìm trong trang đang tải, không tìm trên cả 20.000 dòng, vì mục tiêu của demo là đo chi phí phía client.
