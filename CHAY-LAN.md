# Chạy game trên 3 máy trong cùng mạng LAN

## Máy làm server

1. Kết nối cả ba máy vào cùng một Wi-Fi hoặc mạng LAN.
2. Nhấp đúp `start-server.bat`, hoặc mở PowerShell trong thư mục này và chạy:

   ```powershell
   npm start
   ```

3. Giữ cửa sổ server mở. Server sẽ in ra một hoặc nhiều địa chỉ, ví dụ:

   ```text
   http://192.168.1.25:4173
   ```

4. Máy server cũng có thể chơi bằng địa chỉ `http://localhost:4173`.

## Hai máy chơi

1. Mở trình duyệt và nhập đúng địa chỉ LAN hiện trên máy server, ví dụ `http://192.168.1.25:4173`.
2. Máy thứ nhất nhập tên và chọn **Tạo phòng mới**.
3. Gửi mã phòng gồm 5 ký tự cho máy thứ hai.
4. Máy thứ hai nhập tên, nhập mã và chọn **Vào phòng**.
5. Máy thứ hai chọn ghế còn trống. Khi đủ hai ghế, ván đấu bắt đầu.

## Nếu máy khác không mở được game

- Kiểm tra cả ba máy đang ở cùng mạng.
- Cho phép `Node.js JavaScript Runtime` qua Windows Defender Firewall ở mạng **Private**.
- Không đóng cửa sổ `start-server.bat` trong lúc chơi.
- Kiểm tra địa chỉ IP bằng `ipconfig`; dùng địa chỉ IPv4 của Wi-Fi/Ethernet, không dùng `127.0.0.1` trên máy khác.

Phòng chơi hiện được giữ trong bộ nhớ. Nếu tắt server, các phòng và ván đang chơi sẽ mất.
