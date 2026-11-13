# Plan: tái hiện lỗi cập nhật tần suất cao qua SSE

Trạng thái: **đang thực hiện**. Đã xong A1 đến A6 và B1 (đã kiểm tra). Tiếp theo: B2 (biến thể `naive`).

## Mục tiêu

Mục đích là **học** `requestAnimationFrame` và batching, và so sánh `setTimeout` với `requestAnimationFrame`. Không phải demo portfolio, cũng không khớp một ứng dụng thật.

Tái hiện lỗi "update storm": server đẩy khoảng 1.000 message/s qua SSE để cập nhật bảng, mỗi message gây một lần render riêng. Ba triệu chứng cần tái hiện và đo:

1. INP kém, vì thao tác của người dùng xếp hàng sau các task message và render.
2. Độ trễ hiển thị tăng dần so với server.
3. Bộ nhớ tăng.

Giả thuyết cơ chế: tốc độ cập nhật (1.000/s) vượt xa tốc độ màn hình hiển thị (khoảng 60/s), nhưng mỗi message ở một task riêng nên React không gộp được, dẫn đến tới 1.000 lần render mỗi giây mà chỉ khoảng 60 lần được vẽ. Giả thuyết này được kiểm chứng ở bước B2.

## Quyết định đã chốt

- Cả ba triệu chứng đều cần tái hiện (INP, độ trễ, bộ nhớ).
- Ô lọc hoạt động khi stream chạy. Không sắp xếp.
- Mỗi message là bản vá một dòng: `id`, vài trường đổi (ví dụ `status`, `qty`, `total`, `updatedAt`), cùng `seq` và `sentAt`. Áp dụng cho 1.000 dòng đang tải, id chọn đều ngẫu nhiên theo seed.
- Không reconnect, không nhiều client.
- Ứng dụng thứ 2 nằm trong cùng monorepo, **không dùng chung code với `apps/web` và `apps/api`**.
- Công cụ monorepo: **chỉ Turborepo** (không Nx), chạy trên pnpm workspace hiện có.
- Frontend: **Vite + React**. API: **NestJS riêng** trong app mới.

## Cấu trúc monorepo

```text
apps/web          giữ nguyên (cổng 3000)
apps/api          giữ nguyên (cổng 3001)
apps/stream-web   MỚI: Vite + React, cổng 5173
apps/stream-api   MỚI: NestJS, endpoint SSE, cổng 3002
turbo.json        MỚI
```

- `pnpm-workspace.yaml` đã có `apps/*`, nên hai app mới tự được nhận, không cần sửa.
- Không tạo package dùng chung. `COLUMNS`, formatter và đồng hồ INP được **sao chép** sang `stream-web` (khoảng 100 dòng trùng lặp), theo đúng yêu cầu tách biệt. Hợp đồng `window.__interactions` được giữ giống bản gốc để bộ đo tương tự dùng được.
- `stream-api` sao chép cấu hình NestJS (`nest-cli.json`, `tsconfig.json`, `package.json`) từ `apps/api` với cùng phiên bản dependency, để lockfile ít thay đổi nhất.
- Cổng cố định: `stream-web` 5173 (`strictPort`, cả dev và preview), `stream-api` 3002 với CORS chỉ cho `http://localhost:5173`. Tránh đụng cổng 3000 và 3001 của demo gốc.
- `turbo.json` có ba task: `build` (phụ thuộc `^build`, outputs gồm `.next/**` trừ `.next/cache/**`, và `dist/**`), `dev` (không cache, persistent), `start` (phụ thuộc `build`, không cache, persistent).
- Script gốc đổi sang `turbo run build|dev|start`, thêm `dev:stream` (`turbo run dev --filter=stream-web --filter=stream-api`) để không phải bật cả bốn server, và `measure:stream`. Script `measure` của demo gốc giữ nguyên.

Điểm cần kiểm tra khi thực hiện (chưa xác minh):
- Turborepo thường yêu cầu trường `packageManager` ở `package.json` gốc, hiện chưa có. Sẽ thêm theo kết quả `pnpm -v`.
- Tên khóa trong `turbo.json` (`tasks` hay `pipeline`) phụ thuộc phiên bản Turborepo được cài. Sẽ đối chiếu với phiên bản thực tế.
- Sau khi đổi sang Turborepo, `pnpm start` sẽ tự build trước (vì `start` phụ thuộc `build`), khác với mô tả hiện tại trong CLAUDE.md. Cần cập nhật tài liệu.

## Tham khảo từ project hiện tại (sao chép, không import)

- Dữ liệu tất định, `COLUMNS`, formatter và đồng hồ INP (`InpMeter` trong `apps/web/app/shared.tsx`).
- `scripts/measure.mjs` làm khuôn cho `scripts/measure-stream.mjs` (Playwright, Event Timing, throttle CPU).

Không dùng lại nguyên trạng, vì sao thiết kế mới khác:
- `useRows` giữ dữ liệu bằng `useState` dưới dạng một mảng, mỗi message sẽ phải sao chép mảng 1.000 phần tử.
- Trang `/fixed` sẽ hỏng dưới stream: `searchable` phụ thuộc vào `table.items` nên chạy lại `JSON.stringify` cho cả 1.000 dòng mỗi lần mảng đổi.
- `measure.mjs` hiện chỉ đo khi trang đứng yên.

## Thiết kế

**Server (`stream-api`).** `GET /stream?rate=N&seed=S`. Dùng PRNG có seed để cùng seed cho cùng chuỗi message. Phát theo lô mỗi 10 ms (khoảng `N/100` message mỗi lô) thay vì một timer cho mỗi message. API `@Sse()` trên Nest 12 chưa được xác minh, bước B1 sẽ kiểm tra.

**Client (`stream-web`).** Một trang duy nhất, chọn biến thể bằng query (không cần router). Store ngoài React giữ `Map<id, Row>`. Dòng đăng ký qua `useSyncExternalStore` theo id, nên chỉ dòng đang hiển thị và đã đổi mới render lại. Message cho dòng ngoài viewport chỉ ghi vào store.

**Lọc khi đang stream.** Một bản vá có thể làm dòng vào hoặc ra khỏi kết quả lọc. Ở biến thể đã sửa, mỗi lần flush chỉ dựng lại chuỗi tìm kiếm cho các dòng đã đổi, rồi lọc lại danh sách `visible` (1.000 phép `includes`). Ở biến thể ngây thơ, giữ cách cũ: `JSON.stringify` cả bảng mỗi lần render.

**Các trục thay đổi** (độc lập với nhau, nên đo riêng được):

| Trục | Lựa chọn |
| --- | --- |
| Lên lịch | mỗi message một lần (mốc) / `setTimeout` N ms / `requestAnimationFrame` |
| Bộ đệm | danh sách (không gộp) / `Map` theo id (gộp, bị chặn kích thước) |
| Render | state mảng, render lại cả bảng (markup giống `/broken`) / subscription theo dòng, virtualized |

Chọn bằng query, ví dụ `/?mode=naive`, `/?mode=raf&buffer=map`, `/?mode=timeout&ms=100&buffer=list`. Hàm `flush` và store dùng chung, chỉ dòng lên lịch và kiểu bộ đệm khác nhau. Không tạo thêm lớp trừu tượng.

## So sánh rAF và setTimeout (giả thuyết cần đo)

- `setTimeout` với N lớn (100 ms) có thể tốn ít CPU hơn vì ít lần commit hơn, nhưng dữ liệu trễ hơn và mỗi lô lớn hơn nên task đơn lẻ có thể dài hơn.
- `setTimeout` với N khoảng 16 ms gần bằng rAF về tần số nhưng không căn theo frame. Đây là phép so sánh để thấy giá trị của việc căn nhịp với việc vẽ.
- Tab chạy nền: rAF bị tạm dừng, `setTimeout` bị giãn xuống khoảng 1 lần mỗi giây.
- Về INP, chưa dự đoán được bên nào tốt hơn.

## Bộ nhớ: tái hiện thế nào

Chưa biết bản ngây thơ có tăng bộ nhớ thật không, nên kế hoạch đo trước rồi mới kết luận. Có ba nguồn khả dĩ:

1. **Hàng đợi tồn đọng:** khi main thread không theo kịp, dữ liệu SSE và task message tích tụ.
2. **Rác sinh ra từ việc sao chép mảng và tạo đối tượng cho mỗi message.** Đây là GC churn (đồ thị răng cưa), không phải rò rỉ.
3. **Bộ đệm dạng danh sách khi tab nền:** rAF tạm dừng nhưng message vẫn đến, nên danh sách phình mãi. Đây là bẫy kinh điển và là lý do `buffer=map` tồn tại.

Cách đo: chạy 60 giây, lấy mẫu `JSHeapUsedSize` qua CDP `Performance.getMetrics`, gọi `HeapProfiler.collectGarbage` trước mỗi lần lấy mẫu để phân biệt rò rỉ với churn. Nếu bản ngây thơ không tăng bộ nhớ thật, báo cáo đúng như vậy, và chỉ biến thể `buffer=list` trong tab nền là tăng.

## Chỉ số

- INP, từ `window.__interactions`, gồm cả thao tác gõ vào ô lọc khi stream chạy.
- Tổng thời gian long task và FPS (đo khoảng cách giữa các `requestAnimationFrame`).
- Số lần render mỗi giây.
- Số message được áp dụng mỗi giây so với số message server gửi (phát hiện main thread bị bỏ đói).
- Độ trễ hiển thị p50 và p95, từ `sentAt` đến lúc được vẽ, và xu hướng theo thời gian (tăng dần hay ổn định).
- Tổng thời gian bận của main thread, qua CDP `Performance.getMetrics`.
- Bộ nhớ theo thời gian, như mô tả ở trên.

## Các bước

### Phần A: dựng monorepo và hai app mới

- **A1. Thêm Turborepo.** Cài `turbo` ở gốc, thêm `packageManager`, tạo `turbo.json`, đổi script gốc. Kiểm tra: `pnpm build` build được `web` và `api` như trước, và lần chạy thứ hai báo cache hit.
- **A2. Dựng `stream-api`.** Chỉ cần một endpoint tạm trả về 200. Kiểm tra: `pnpm --filter stream-api build && start` rồi `curl` cổng 3002.
- **A3. Dựng `stream-web`.** Vite + React, trang trống hiển thị "0 rows" và đồng hồ INP sao chép. Kiểm tra: `pnpm --filter stream-web build` thành công, trang mở được ở cổng 5173.
- **A4. Chạy đồng thời.** Kiểm tra: `pnpm dev:stream` bật hai app mới và `pnpm dev` bật cả bốn mà không đụng cổng.
- **A5. Demo gốc không bị ảnh hưởng.** Kiểm tra: `pnpm start` rồi `pnpm measure` vẫn cho số gần với bảng README (khoảng 168 ms click `/broken` ở CPU 1x), không có thay đổi nào trong `apps/web` và `apps/api`.

### Phần B: tái hiện lỗi stream

- **B1. SSE phía server.** Kiểm tra: `curl -N` đếm số dòng trong 5 giây khớp với `rate`, và cùng seed cho cùng chuỗi.
- **B2. Biến thể `mode=naive`.** Kiểm tra: ở 1.000 msg/s đồng hồ INP đỏ và số lần render gần bằng số message. Nếu không, giả thuyết cơ chế sai và cần xem lại.
- **B3. `measure-stream.mjs`.** Kiểm tra: ở rate=0 biến thể naive cho số gần với `/broken` (cùng markup), xác nhận bộ đo không làm lệch. Đầu ra là một dòng JSON mỗi cấu hình, giống `measure.mjs`.
- **B4. Biến thể `mode=raf` và `mode=timeout`**, cùng `buffer=map`. Kiểm tra: cùng bộ đo cho kết quả tốt hơn bản ngây thơ.
- **B5. Kiểm tra tính đúng đắn.** Sau khi stream dừng, trạng thái bảng và kết quả lọc phải bằng trạng thái mong đợi tính từ seed. Việc gộp cập nhật không được làm mất dữ liệu.
- **B6. Tách từng trục.** Bật từng thay đổi một (lên lịch, bộ đệm, kiểu render) và đo riêng, vì lần trước ta không tách được đóng góp của từng cách sửa.
- **B7. Bộ nhớ và tab nền.** Chạy đo 60 giây cho từng biến thể, và thêm trường hợp chuyển tab trong lúc stream chạy, so sánh `buffer=list` với `buffer=map`.
- **B8. Ghi tài liệu.** Cập nhật README và CLAUDE.md: cấu trúc mới, lệnh mới (`dev:stream`, `measure:stream`), ràng buộc cổng mới, việc `start` giờ tự build, và vài dòng ghi lại điều rút ra về rAF và `setTimeout`.

## Ma trận đo

Rate: 0, 100, 500, 1.000, 2.000, 5.000 msg/s. CPU: 1x và 4x. `setTimeout` thử N = 16, 50, 100, 250. Với mỗi biến thể, tìm "điểm gãy": rate đầu tiên mà INP vượt 200 ms hoặc số message áp dụng mỗi giây tụt xuống dưới số server gửi. Không chọn trước một rate cố định.

Từ khoảng 5.000 msg/s trở lên, server Node hoặc kích thước message có thể thành nút cổ chai và làm phép đo sai. Nếu `curl -N` ở bước B1 cho thấy server không đạt rate yêu cầu thì không đo ở mức đó.

## Ngoài phạm vi

Nx, package dùng chung giữa các app, sắp xếp, reconnect với `Last-Event-ID`, nhiều client, WebSocket, xác thực.
