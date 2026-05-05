Add-Type -AssemblyName System.Drawing
$inputPath = "C:\Users\bajacob\.gemini\antigravity\brain\b9f0050d-6e4b-437e-ae29-02f034408b38\stadium_arena_og_v4_1778002522888.png"
$outputPath = "c:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\apps\frontend\public\og-image.jpg"

$img = [System.Drawing.Image]::FromFile($inputPath)
$img.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img.Dispose()
