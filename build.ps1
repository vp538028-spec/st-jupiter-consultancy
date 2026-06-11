$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"

if (Test-Path $dist) {
  Remove-Item -LiteralPath $dist -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $dist | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "assets") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "pages") | Out-Null

@("*.html", "*.css", "*.js", "*.json") | ForEach-Object {
  Get-ChildItem -LiteralPath $root -File -Filter $_ |
    Where-Object { $_.Name -ne "server.js" } |
    Copy-Item -Destination $dist -Force
}

Copy-Item -LiteralPath (Join-Path $root "server.js") -Destination (Join-Path $dist "server.js") -Force
Copy-Item -Path (Join-Path $root "assets\*") -Destination (Join-Path $dist "assets") -Recurse -Force
Copy-Item -Path (Join-Path $root "pages\*") -Destination (Join-Path $dist "pages") -Recurse -Force
if (Test-Path (Join-Path $root ".env")) {
  Copy-Item -LiteralPath (Join-Path $root ".env") -Destination (Join-Path $dist ".env") -Force
}

Write-Host "Build complete: $dist"
