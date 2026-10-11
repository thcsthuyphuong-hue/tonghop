# HUE SMART TEST 7991

Hệ thống ôn tập, luyện đề và kiểm tra môn Vật lý 9. Ứng dụng chạy trên trình duyệt, lưu ngân hàng câu hỏi, danh sách học sinh và kết quả trên Firebase.

Trang học sinh: https://thcsthuyphuong-hue.github.io/tonghop/

## Tính năng dành cho học sinh

- Chọn đề tổng hợp hoặc ôn theo từng chuyên đề Vật lý 9 (Bài 11–15).
- Làm bài ở chế độ **Luyện tập** hoặc **Kiểm tra**.
- Đề được chọn ngẫu nhiên từ ngân hàng câu hỏi, tối đa 12 câu trắc nghiệm nhiều lựa chọn, 4 câu đúng/sai và 4 câu trả lời ngắn; số câu thực tế tùy dữ liệu giáo viên đã tải lên.
- Có đồng hồ đếm giờ, chuyển câu, kiểm tra câu trả lời trước khi nộp và xem lại đáp án cùng phần giải thích sau khi làm bài.
- Chế độ luyện tập có gợi ý với số lượt do quản trị viên cấu hình.
- Lưu điểm, thời gian làm bài và thông tin thí sinh lên hệ thống để theo dõi kết quả.
- Có thể gửi báo lỗi kèm mô tả và ảnh chụp màn hình.
- Bài kiểm tra phát hiện một số hành vi rời trang/cửa sổ hoặc thay đổi kích thước màn hình; hệ thống có thể tự nộp bài theo cơ chế này.

## Giáo viên tải đề lên hệ thống

Giáo viên có thể tải ngân hàng câu hỏi lên Firebase theo từng chuyên đề bằng file Word `.docx`:

1. Mở trang web và vào **Quản trị** bằng tài khoản được cấp.
2. Chọn tab **Quản lý đề thi**.
3. Bấm **Tải file Word mẫu** để lấy mẫu chuẩn của hệ thống.
4. Soạn câu hỏi theo các tiêu đề phần và định dạng nhận diện:
   - **PHẦN I - TRẮC NGHIỆM:** mở đầu câu bằng `Câu ...`, liệt kê phương án `A.`, `B.`, `C.`, `D.`, rồi ghi `Đáp án:` và có thể thêm `Giải thích:`.
   - **PHẦN II - ĐÚNG / SAI:** mỗi câu gồm bốn ý `a)` đến `d)`. Ghi đúng/sai sau từng ý hoặc ghi các đáp án theo thứ tự ở dòng `Đáp án:`.
   - **PHẦN III - TRẢ LỜI NGẮN:** ghi câu hỏi, dòng `Đáp án:` và có thể thêm `Giải thích:`.
5. Chọn đúng chuyên đề cần nhập, bấm **Import đề lên đám mây**, chọn file `.docx` và xác thực khi hệ thống yêu cầu.
6. Chờ thông báo nhập thành công rồi kiểm tra số lượng câu trong bảng ngân hàng đề.

> **Lưu ý:** Tải đề vào một chuyên đề sẽ thay thế ngân hàng câu hỏi hiện có của chuyên đề đó. Hãy kiểm tra chuyên đề đã chọn trước khi xác nhận.

## Công cụ quản trị

- **Quản lý học sinh:** tải file mẫu Excel, nhập danh sách học sinh, lọc theo trường/lớp và xử lý bản ghi trùng.
- **Quản lý kết quả:** lọc đồng thời theo trường, lớp, chuyên đề và chế độ; sắp xếp theo điểm, thời gian nộp hoặc thời lượng làm bài; xem lại bài làm và xuất báo cáo Excel.
- **Cài đặt:** cấu hình thời gian luyện tập, thời gian kiểm tra và số lượt gợi ý.
- **Hộp thư báo lỗi:** xem phản hồi và ảnh học sinh gửi.
- Các thao tác quản trị yêu cầu quyền truy cập được cấu hình cho hệ thống.

## Mã lỗi và chẩn đoán

Ứng dụng ưu tiên giữ nguyên mã lỗi chính thức từ Firebase SDK. Mã `permission-denied`, `unauthenticated`, `unavailable`, `auth/invalid-credential` là mã do SDK trả về, không phải mã tự đặt. Khi báo lỗi, gửi cả mã `APP-*` và mã Firebase trong ngoặc nếu có; xem Console để biết chi tiết. Không ghi mật khẩu hoặc token vào log.

### Mã nghiệp vụ riêng của HUE SMART TEST

| Mã | Chức năng | Hướng kiểm tra |
|---|---|---|
| `APP-AUTH-001` | Đăng nhập giáo viên thất bại | Kiểm tra tài khoản và mã Firebase Auth gốc |
| `APP-CFG-001` | Lưu cấu hình thất bại | Kiểm tra phiên giáo viên và Firestore Rules |
| `APP-BANK-001` | Import ngân hàng đề thất bại | Kiểm tra dữ liệu, quyền ghi và kích thước tài liệu |
| `APP-BANK-002` | Xóa ngân hàng đề thất bại | Kiểm tra quyền giáo viên và Rules |
| `APP-STU-001` | Import danh sách học sinh thất bại | Kiểm tra dữ liệu và quyền ghi |
| `APP-STU-002` | Xóa dữ liệu học sinh thất bại | Kiểm tra quyền giáo viên và Rules |
| `APP-SUB-001` | Lưu kết quả bài làm thất bại | Kiểm tra phiên anonymous, quyền tạo kết quả và kết nối |
| `APP-REPORT-001` | Gửi báo cáo lỗi thất bại | Kiểm tra quyền tạo báo cáo, dữ liệu ảnh và kết nối |
| `APP-REPORT-002` | Đọc hộp thư báo lỗi thất bại | Kiểm tra đăng nhập giáo viên và quyền đọc `error_reports` |

### Một số mã Firebase thường gặp

| Mã Firebase gốc | Ý nghĩa |
|---|---|
| `permission-denied` | Firestore Rules từ chối thao tác |
| `unauthenticated` | Chưa có phiên xác thực hợp lệ |
| `unavailable` | Dịch vụ tạm thời không khả dụng |
| `resource-exhausted` | Vượt hạn mức hoặc tài nguyên |
| `invalid-argument` | Dữ liệu hoặc tham số không hợp lệ |
| `auth/invalid-credential` | Thông tin đăng nhập không hợp lệ |
| `auth/user-disabled` | Tài khoản bị vô hiệu hóa |
| `auth/too-many-requests` | Quá nhiều lần thử đăng nhập |
| `auth/network-request-failed` | Lỗi kết nối dịch vụ xác thực |

Danh sách Firebase trên chỉ gồm một số mã thường gặp, không phải toàn bộ mã SDK. Khi gặp mã khác, giữ nguyên `error.code` và `error.message` để tra cứu tài liệu Firebase; không thay mã gốc bằng mã tự đặt.

## Yêu cầu sử dụng

- Trình duyệt hiện đại và kết nối Internet.
- Kết nối Firebase của dự án cần hoạt động để tải danh sách học sinh, ngân hàng đề, lưu kết quả và sử dụng công cụ quản trị.
- Đề cần được tải lên đúng chuyên đề trước khi học sinh có thể làm bài theo chuyên đề đó.

