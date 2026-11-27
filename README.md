# TFT Meta Lab

Dashboard tiếng Việt để chọn bài TFT trước trận, kiểm tra cách ghép đồ và ghi kết quả sau trận. Dữ liệu PBE được giữ riêng khỏi live.

## Chạy trên Windows

1. Cài [Node.js 22 trở lên](https://nodejs.org/).
2. Giải nén dự án nếu tải dưới dạng ZIP. Mở Terminal trong thư mục có tệp `package.json`.
3. Chạy `npm start` và mở [http://127.0.0.1:4173](http://127.0.0.1:4173).
4. Bấm **Cập nhật dữ liệu** để lấy số liệu mới. Lệnh `npm run sync` tải dữ liệu tương tự từ Terminal. Không cần npm install hay API key.
5. Chạy `npm test` để kiểm tra cách đọc dữ liệu và tính điểm.

Dashboard chạy cục bộ. Nhật ký thử bài lưu trong trình duyệt theo nguồn, set, patch và đội hình. Trận chưa dựng được bài vẫn được tính để bạn so sánh tỷ lệ hoàn thành bài với tỷ lệ top 4.

## Dữ liệu

| Nguồn | Phạm vi |
| --- | --- |
| [MetaTFT](https://www.metatft.com/comps) | Nhóm đội hình PBE và Ranked live. Xác định hạng trung bình, top 4 và top 1 từ số lượt theo tám thứ hạng. Dùng thống kê bộ đồ riêng của MetaTFT khi có từ 30 quan sát. |
| [tactics.tools](https://tactics.tools/team-compositions/latest) | Phần bảng Ranked công khai được máy chủ trả về. Dashboard giữ nguyên cỡ mẫu và bộ lọc của bảng. Thành phần đội hình và nhãn đến từ cùng ảnh chụp của trang. |
| [Riot Data Dragon](https://developer.riotgames.com/docs/tft#data-dragon) | Danh mục tên, ảnh và giá tướng, tên và ảnh trang bị, tên tộc hệ. Tự đọc manifest Riot và thử bản tiếng Việt trước. |

Bản đầu khởi động bằng ảnh chụp đã kiểm tra ngày 27/11/2026. Lần làm mới kế tiếp lưu vào `data/cache.json`. Nếu một nguồn bị lỗi, dashboard giữ ảnh chụp thành công gần nhất của nguồn đó và hiển thị tình trạng. Các nguồn cộng đồng cung cấp dữ liệu qua giao diện công khai của họ và có thể thay đổi định dạng. App giới hạn một lần cập nhật mỗi hai phút khi chạy trong trình duyệt.

Patch của MetaTFT Live được ghi theo patch Riot công bố nếu khớp set. Cửa sổ thống kê của từng nguồn có thể đi qua một hotfix. PBE hiển thị ngày lấy dữ liệu riêng do máy chủ thử nghiệm có thể thay đổi build giữa các lần đo. Có thể đặt biến môi trường `TFT_DDRAGON_VERSION` để dùng chính xác phiên bản danh mục Riot đã phát hành. Schema Unreal Set 19 có đường dẫn icon riêng. Khi danh mục Riot chưa có tên tướng PBE, app dùng bảng tên MetaTFT.

## Dùng số liệu để chọn bài thử

- Bắt đầu với **Bài mạnh ít người chơi**, giữ mẫu tối thiểu 200 rồi chỉnh ngưỡng play rate theo dữ liệu bạn thấy. Play rate là số người chơi trung bình mỗi lobby tám người, tính bằng tám lần tỷ lệ lượt khớp bài trong mẫu.
- Xem cả hạng trung bình, top 4 và top 1. Xếp hạng hiệu chỉnh kéo các mẫu bé về mốc nền để giảm ảnh hưởng của biến động. Điểm độ dễ dùng mốc roll/lên cấp, giá chủ lực và tín hiệu phụ thuộc Ấn. Đây là quy tắc của dashboard.
- Đối chiếu đội hình tương tự ở nguồn khác khi cùng set, patch, máy chủ, có chung một tướng chủ chốt và ít nhất 55% giao nhau so với hợp hai đội hình. Chỉ số hai nhóm mẫu được hiển thị riêng.
- Chọn mảnh đồ trong **Mảnh đồ để thử ghép**. Mỗi gợi ý ghép được tính riêng lẻ. Công thức áp dụng cho bộ đồ cơ bản, không gồm Ấn, Tạo Tác hay đồ Ánh Sáng.
- Khi test, ghi cả trận bỏ bài, mục tiêu cấp hoặc sao của chủ lực và lý do hụt mốc. Hạng trung bình của các bàn cờ được nhận diện cuối trận không phản ánh đầy đủ số trận đã cố chơi bài.

TFT Meta Lab isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
