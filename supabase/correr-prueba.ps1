# Pregunta el correo y la contraseña del usuario de prueba, corre la prueba de carga y guarda el resultado
# en supabase\resultado-prueba.txt. La contraseña solo vive en esta ventana mientras corre: no se guarda en ningún archivo.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
Write-Host ''
Write-Host '  Prueba de carga de LoteControl contra tu base de Supabase' -ForegroundColor Yellow
Write-Host ''
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '  No se encontro Node.js en este computador. Avisale a Claude y te da otra opcion.' -ForegroundColor Red
  exit 1
}
$mail = Read-Host '  Correo del usuario de prueba'
$sec  = Read-Host '  Contrasena (no se ve mientras la escribes)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$env:TEST_EMAIL = $mail.Trim()
$env:TEST_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
Write-Host ''
Write-Host '  Corriendo la prueba (unos segundos)...' -ForegroundColor Cyan
try {
  $salida = & node supabase/prueba-real.js 2>&1 | ForEach-Object { "$_" }
} finally {
  Remove-Item Env:TEST_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:TEST_EMAIL -ErrorAction SilentlyContinue
}
$salida | Out-File -FilePath 'supabase\resultado-prueba.txt' -Encoding utf8
Write-Host ''
$salida | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host '  Listo. El resultado quedo guardado en supabase\resultado-prueba.txt (no contiene contrasenas).' -ForegroundColor Green
