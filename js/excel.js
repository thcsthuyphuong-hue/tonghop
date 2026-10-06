// Tiện ích Excel dùng cho quản trị.
export const downloadStudentTemplate = () => {
    const templateData = [{ "STT": 1, "Họ và Tên": "Nguyễn Văn A", "Lớp": "9A1", "SBD": "01", "Trường": "THCS Thuỷ Phương" }, { "STT": 2, "Họ và Tên": "Trần Thị B", "Lớp": "9A2", "SBD": "02", "Trường": "THCS Thuỷ Phương" }];
    const ws = globalThis.XLSX.utils.json_to_sheet(templateData);
    const wb = globalThis.XLSX.utils.book_new();
    globalThis.XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocSinh");
    globalThis.XLSX.writeFile(wb, "Mau_DanhSachHocSinh.xlsx");
};

export const exportResultsToExcel = (dataToExport, showAlert) => {
    if (!dataToExport || dataToExport.length === 0) {
        showAlert("Không có dữ liệu để xuất!");
        return;
    }
    const excelRows = dataToExport.map((item, index) => ({
        "STT": index + 1,
        "Họ và Tên": item.name || "",
        "Số báo danh": item.sbd || "",
        "Lớp": item.class || "",
        "Trường": item.school || "",
        "Chuyên đề": item.topic || "N/A",
        "Chế độ làm": item.mode === 'practice' ? "Luyện tập" : "Kiểm tra",
        "Điểm số": Number((item.score || 0).toFixed(2)),
        "Thời gian làm (giây)": item.duration || 0,
        "Ngày nộp bài": new Date(item.timestamp).toLocaleString('vi-VN')
    }));
    const ws = globalThis.XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [{wch: 5}, {wch: 25}, {wch: 12}, {wch: 10}, {wch: 25}, {wch: 35}, {wch: 15}, {wch: 10}, {wch: 18}, {wch: 25}];
    const wb = globalThis.XLSX.utils.book_new();
    globalThis.XLSX.utils.book_append_sheet(wb, ws, "Báo cáo học tập");
    globalThis.XLSX.writeFile(wb, `KetQua_TongHop_${new Date().getTime()}.xlsx`);
};
