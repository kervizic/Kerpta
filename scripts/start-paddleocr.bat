@echo off
echo ============================================
echo  Demarrage PaddleX Serving - PaddleOCR-VL
echo  Port : 12321
echo  CPU uniquement (preserve la VRAM)
echo ============================================

:: Verifier si Python est installe
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python non installe. Installez Python 3.10+ depuis python.org
    pause
    exit /b 1
)

:: Verifier si paddlex est installe, sinon l'installer
python -c "import paddlex" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de PaddlePaddle + PaddleOCR + PaddleX...
    echo [INFO] Cela peut prendre quelques minutes...
    pip install paddlepaddle "paddleocr[doc-parser]" paddlex
    python -c "import paddlex" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec de l'installation. Verifiez votre connexion internet.
        pause
        exit /b 1
    )
    echo [OK] Packages installes.
)

:: Installer le plugin serving si pas encore fait
:: On verifie via la presence du fichier marker plutot que par import
if not exist "%LOCALAPPDATA%\paddlex_serving_installed.flag" (
    echo [INFO] Installation du plugin serving...
    paddlex --install serving
    echo. > "%LOCALAPPDATA%\paddlex_serving_installed.flag"
    echo [OK] Plugin serving installe.
)

echo.
echo [OK] Tout est installe.
echo Demarrage du serveur PaddleX (PaddleOCR-VL)...
echo Endpoint : http://0.0.0.0:12321/layout-parsing
echo.

paddlex --serve --pipeline PaddleOCR-VL --device cpu --host 0.0.0.0 --port 12321

pause
