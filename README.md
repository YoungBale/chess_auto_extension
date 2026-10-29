# ♟️ Chess Auto Tool Pro — Chrome Extension (Stockfish GM Offline & Minimax Pro)

Extension Chrome (Manifest V3) tự động phân tích và đánh cờ vua đỉnh cao, tích hợp **Stockfish Grandmaster Engine Offline (Elo 3200+)**, **Lichess Cloud Database**, **GM Opening Book** và **Local Minimax Pro (Alpha-Beta + Piece-Square Tables)**.

Tương thích hoàn hảo với các trang web cờ vua PvP (như **allinonecr7.com/pvp**, **Chess.com**, **Lichess**, bàn cờ thử nghiệm...).

---

## 🌟 1. Các tính năng đột phá vừa nâng cấp

1. **⚡ Stockfish GM Engine 100% Offline (Elo 3200+ đến 3500+)**:
   - Chạy trực tiếp qua Web Worker ngay trong trình duyệt.
   - **Không cần kết nối mạng**, phản hồi thần tốc trong **100ms - 250ms**, không bao giờ bị timeout hay rate limit.
   - Trình độ đại kiện tướng bất bại trước mọi đối thủ.

2. **🎚️ Thanh điều chỉnh Elo linh hoạt (Elo 1200 - 3200+)**:
   - **Elo 1200 - 1600 (Nghiệp dư / Casual)**: Đánh vừa sức, tự nhiên như người thật.
   - **Elo 2200 - 2500 (Kiện tướng / Master)**: Nước đi sắc sảo, chiến thuật đỉnh cao.
   - **Elo 3200+ (Đại kiện tướng GM)**: Hủy diệt tối đa, bách chiến bách thắng.

3. **📚 Thư viện khai cuộc Đại Kiện Tướng (GM Opening Book)**:
   - Tự động đi ngay trong 0ms các khai cuộc hàng đầu: *Sicilian Defense (Open, Najdorf, Classical), French Defense, Caro-Kann, Italian Game, Ruy Lopez, Queen's Gambit, Indian Defenses, English Opening...*

4. **⚡ Phát hiện Chiếu Hết Tức Thì (Instant Mate-in-1 trong 0ms)**:
   - Bắt trọn mọi cơ hội dứt điểm ván đấu ngay lập tức (Ăn Xe chiếu hết, Ăn Hậu chiếu hết...).

5. **🧠 Local Minimax Pro Engine (Dự phòng thuần JS)**:
   - Thuật toán Minimax kết hợp **Alpha-Beta Pruning (Depth 3-4)**, **Piece-Square Tables (PST)** đánh giá vị trí ô cờ đa chiều và **Quiescence Search** chống bẫy dâng quân / đổi quân lỗ.

6. **🎯 Hỗ trợ tối ưu bàn cờ allinonecr7.com / react-chessboard / @dnd-kit**:
   - Tương tác trực tiếp vào React Fiber (`onPieceDrop`, `onSquareClick`) kết hợp mô phỏng kéo thả Pointer/Mouse mượt mà, chính xác 100%.

---

## 🚀 2. Hướng dẫn nạp / cập nhật vào Google Chrome

### Bước 1: Mở trang Quản lý Tiện ích
Truy cập vào trình duyệt Chrome:
```
chrome://extensions/
```

### Bước 2: Tải lại Extension
1. Đảm bảo chế độ **"Developer mode"** (Chế độ cho nhà phát triển) đang **BẬT (ON)**.
2. Tìm tiện ích **"Chess Auto Tool (Stockfish Engine)"**:
   - Nếu đã cài trước đó: Nhấn nút **biểu tượng Xoay vòng (Reload / Tải lại)** để nạp toàn bộ mã nguồn mới.
   - Nếu cài mới: Nhấn **"Load unpacked"** (Tải tiện ích đã giải nén) và chọn thư mục:
     ```
     c:\Users\tngu8\OneDrive\Documents\tool\chess-auto-extension
     ```
3. Ghim (Pin) biểu tượng extension lên thanh công cụ Chrome.

---

## 🎮 3. Hướng dẫn chơi trên allinonecr7.com/pvp

1. Mở trang **[allinonecr7.com/pvp](https://allinonecr7.com/pvp)** và vào phòng chơi **Cờ vua**.
2. Trên màn hình sẽ xuất hiện bảng điều khiển nổi **Chess Auto Pro** ở góc dưới bên phải màn hình.
3. Mở popup extension hoặc dùng trực tiếp HUD:
   - **Phe bot:** Để `Tự động 🔄` (hoặc chọn đúng màu quân Trắng/Đen của bạn).
   - **Engine:** Chọn `⚡ Stockfish GM Offline (Elo 3200+)` (đã được đặt làm mặc định).
   - **Sức cờ (Elo):** Tùy chỉnh mức Elo bạn muốn (mặc định 3200).
   - **Độ trễ (Delay):** Khuyên dùng `1.2s - 1.5s` để vừa tự nhiên vừa chắc chắn.
4. Bấm **"▶ BẮT ĐẦU"** hoặc nút **"▶ CHẠY"** trên HUD.
5. Bot sẽ tự động phân tích thế cờ, tính nước đi tối ưu và thực hiện nước cờ chuẩn xác trên bàn đấu!
