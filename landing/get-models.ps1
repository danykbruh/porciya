# Downloads free CC0 3D models (Poly Haven) into landing\models
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = "https://dl.polyhaven.org/file/ph-assets/Models"
$models = @(
  @{ id = "food_avocado_01"; bin = "8k"; tex = @("diff", "nor_gl", "rough") },
  @{ id = "food_lime_01";    bin = "8k"; tex = @("diff", "nor_gl", "rough") },
  @{ id = "food_kiwi_01";    bin = "8k"; tex = @("diff", "nor_gl", "rough") },
  @{ id = "lemon";           bin = "4k"; tex = @("diff", "nor_gl", "arm") },
  @{ id = "wooden_bowl_01";  bin = "8k"; tex = @("diff", "nor_gl", "arm") },
  @{ id = "food_apple_01";       bin = "8k"; tex = @("diff", "nor_gl", "rough") },
  @{ id = "food_lychee_01";      bin = "8k"; tex = @("diff", "nor_gl", "rough") },
  @{ id = "food_pomegranate_01"; bin = "8k"; tex = @("diff", "nor_gl", "rough") }
)
foreach ($m in $models) {
  $id = $m.id
  $dir = Join-Path $PSScriptRoot "models\$id"
  New-Item -ItemType Directory -Force -Path (Join-Path $dir "textures") | Out-Null
  if (Test-Path (Join-Path $dir "$id.bin")) { Write-Host "Already have $id"; continue }
  Write-Host "Downloading $id ..."
  Invoke-WebRequest "$base/gltf/1k/$id/${id}_1k.gltf" -OutFile (Join-Path $dir "${id}_1k.gltf") -UseBasicParsing
  Invoke-WebRequest "$base/gltf/$($m.bin)/$id/$id.bin" -OutFile (Join-Path $dir "$id.bin") -UseBasicParsing
  foreach ($t in $m.tex) {
    Invoke-WebRequest "$base/jpg/1k/$id/${id}_${t}_1k.jpg" -OutFile (Join-Path $dir "textures\${id}_${t}_1k.jpg") -UseBasicParsing
  }
}
Write-Host ""
Write-Host "DONE. Models saved to landing\models" -ForegroundColor Green
Get-ChildItem (Join-Path $PSScriptRoot "models") -Recurse -File | Measure-Object -Property Length -Sum | ForEach-Object { "Total size: {0:N1} MB" -f ($_.Sum / 1MB) }
