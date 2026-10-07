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

## Yêu cầu sử dụng

- Trình duyệt hiện đại và kết nối Internet.
- Kết nối Firebase của dự án cần hoạt động để tải danh sách học sinh, ngân hàng đề, lưu kết quả và sử dụng công cụ quản trị.
- Đề cần được tải lên đúng chuyên đề trước khi học sinh có thể làm bài theo chuyên đề đó.

