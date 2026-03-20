@echo off
chcp 65001 >nul 2>&1
title PaddleX OCR Serving - Kerpta
echo ============================================
echo   PaddleX OCR Serving - Installation auto
echo ============================================
echo.

:: Desactiver la verification de connectivite (accelere le demarrage)
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

:: ----------------------------------------------------------------
:: Etape 1 - Verifier Python
:: ----------------------------------------------------------------
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python non trouve. Installez Python 3.10+ et ajoutez-le au PATH.
    pause
    exit /b 1
)
echo [OK] Python trouve.

:: ----------------------------------------------------------------
:: Etape 2 - Installer paddlex si absent
:: ----------------------------------------------------------------
python -c "import paddlex" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de PaddlePaddle + PaddleX...
    pip install paddlepaddle "paddleocr[doc-parser]" paddlex
    python -c "import paddlex" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERREUR] paddlex non importable apres installation.
        pause
        exit /b 1
    )
    echo [OK] Packages installes.
) else (
    echo [OK] PaddleX deja installe.
)

:: ----------------------------------------------------------------
:: Etape 3 - Installer paddlepaddle-gpu depuis le repo officiel
:: ----------------------------------------------------------------
python -c "import paddle; exit(0 if paddle.device.is_compiled_with_cuda() else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de paddlepaddle-gpu depuis le repo officiel Paddle...
    pip install paddlepaddle-gpu -f https://www.paddlepaddle.org.cn/whl/windows/gpu/develop.html
    if %errorlevel% neq 0 (
        echo [WARN] Echec installation GPU - on continuera en CPU.
    ) else (
        echo [OK] paddlepaddle-gpu installe.
    )
) else (
    echo [OK] PaddlePaddle GPU deja installe.
)

:: ----------------------------------------------------------------
:: Etape 4 - Appliquer le patch de compatibilite GPU
:: ----------------------------------------------------------------
echo [INFO] Application du patch de compatibilite GPU...

:: Le script paddlex_patch.py doit etre a cote du .bat
:: S'il n'y est pas, on le telecharge ou on le genere
if exist "%~dp0paddlex_patch.py" (
    python "%~dp0paddlex_patch.py"
) else (
    echo [WARN] paddlex_patch.py non trouve a cote du .bat
    echo [INFO] Generation du patch inline...
    python -c "import os,paddlex;d=os.path.dirname(paddlex.__file__);n=0;[exec('fpath=os.path.join(r,f)\ntry:\n t=open(fpath,encoding=\"utf-8\",errors=\"ignore\").read()\nexcept:t=\"\"\nif \"set_optimization_level\" in t and \"paddlex_gpu_patch\" not in t:\n ls=t.split(chr(10));nl=[]\n for l in ls:\n  s=l.lstrip()\n  if \"set_optimization_level\" in l and not s.startswith(chr(35)) and not s.startswith(\"except\") and \"try:\" not in l and \"hasattr\" not in l:\n   i=len(l)-len(s);sp=chr(32)*i;nl.append(sp+\"try:  # paddlex_gpu_patch\");nl.append(sp+\"    \"+s);nl.append(sp+\"except AttributeError:\");nl.append(sp+\"    pass\")\n  else:nl.append(l)\n open(fpath,\"w\",encoding=\"utf-8\").write(chr(10).join(nl));global n;n+=1;print(\"  Patche: \"+f)') for r,_,fs in os.walk(d) for f in fs if f.endswith('.py')];print('  Total:',n,'fichier(s)')"
)

:: ----------------------------------------------------------------
:: Etape 5 - Installer le plugin serving
:: ----------------------------------------------------------------
echo [INFO] Verification du plugin serving...
paddlex --install serving
echo [OK] Plugin serving pret.

:: ----------------------------------------------------------------
:: Etape 6 - Detecter GPU et demarrer
:: ----------------------------------------------------------------
echo.
set DEVICE=cpu
python -c "import paddle; exit(0 if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0 else 1)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GPU detecte
    set DEVICE=gpu
) else (
    echo [WARN] Pas de GPU detecte, demarrage en CPU.
)

echo ============================================
echo   Device : %DEVICE%
echo   Endpoint : http://0.0.0.0:12321/layout-parsing
echo ============================================
echo.

:: Lancer avec la sortie d'erreur visible (pas de redirection)
paddlex --serve --pipeline PaddleOCR-VL --device %DEVICE% --host 0.0.0.0 --port 12321

echo.
echo [INFO] PaddleX s'est arrete.
echo [INFO] Si le serveur a plante, relancez ce script.
pause
