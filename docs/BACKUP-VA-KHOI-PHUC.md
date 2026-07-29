# Backup và khôi phục ZaloCRM

## Phạm vi

`scripts/Backup-ZaloCRM.ps1` tạo một bộ backup gồm:

- `database.dump`: PostgreSQL custom-format, đã kiểm tra bằng `pg_restore --list`.
- `media.tar.gz`: toàn bộ file trong volume local của ứng dụng, đã kiểm tra bằng `tar -tzf`.
- `SHA256SUMS.txt`: checksum phát hiện file hỏng.
- `manifest.json`: thời gian, kích thước và checksum của bộ backup.

Backup mặc định nằm trong `backups/scheduled`, giữ 14 ngày. Nếu cấu hình
`rclone`, mỗi bộ backup được upload và kiểm tra checksum ở nơi ngoài máy, mặc
định giữ 90 ngày.

## Chạy thử tại máy

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Backup-ZaloCRM.ps1
```

Không cấu hình remote thì lệnh vẫn tạo và xác minh backup local.

## Kết nối NAS hoặc nơi lưu ngoài máy

Cài `rclone`, sau đó chạy:

```powershell
rclone config
```

Các lựa chọn thông dụng:

- NAS có SFTP: tạo remote loại `sftp`, ví dụ tên `nas`.
- NAS đã map thành ổ đĩa Windows: dùng đường dẫn như `Z:\NhaYenCRM`.
- S3/Backblaze B2/Wasabi: chọn provider tương ứng.

Chạy thử upload:

```powershell
.\scripts\Backup-ZaloCRM.ps1 -RcloneDestination "nas:/backups/nhayencrm"
```

Thông tin đăng nhập nằm trong cấu hình bảo mật của `rclone`, không ghi vào
repository hay Scheduled Task.

## Cài lịch chạy tự động

Chạy PowerShell bằng tài khoản Windows vận hành Docker:

```powershell
.\scripts\Install-ZaloCRM-BackupTask.ps1 `
  -DailyAt "01:30" `
  -RcloneDestination "nas:/backups/nhayencrm"
```

Máy phải đang bật và Docker Desktop phải chạy. Tùy chọn `StartWhenAvailable`
giúp Windows chạy bù nếu máy tắt đúng giờ đã đặt.

## Kiểm tra định kỳ

Mỗi tháng nên tải một bộ backup từ remote và kiểm tra:

```powershell
Get-FileHash .\database.dump -Algorithm SHA256
Get-FileHash .\media.tar.gz -Algorithm SHA256
```

So sánh với `SHA256SUMS.txt`. Ít nhất mỗi quý nên diễn tập khôi phục trên một
database test; backup chưa từng restore thử chưa được xem là backup đã đảm bảo.

## Khôi phục

Thao tác khôi phục sẽ ghi đè dữ liệu nên không được tự động hóa trong script
backup. Quy trình tổng quát:

1. Dừng backend để ngăn phát sinh dữ liệu mới.
2. Tạo một backup cuối cùng trước khi khôi phục.
3. Kiểm tra checksum của bộ cần khôi phục.
4. Khôi phục `database.dump` bằng `pg_restore` vào database trống.
5. Giải nén `media.tar.gz` vào volume `zalocrm_file_storage`.
6. Khởi động backend và kiểm tra đăng nhập, tin nhắn, đơn hàng và ảnh.

Nên thực hiện lần đầu trên database/volume test. Không khôi phục trực tiếp vào
production nếu chưa xác nhận bộ backup đọc được.
