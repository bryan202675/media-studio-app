#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "    Media Studio - Motor de Descargas Local     "
echo "================================================"
echo "Iniciando servidor local en http://localhost:5050 ..."

# Matar cualquier proceso previo en el puerto 5050 si existe
lsof -ti:5050 | xargs kill -9 2>/dev/null

# Iniciar servidor con uvicorn
if [ -d "venv" ]; then
    ./venv/bin/python3 -m uvicorn app:app --host 0.0.0.0 --port 5050 --reload &
else
    python3 -m uvicorn app:app --host 0.0.0.0 --port 5050 --reload &
fi

SERVER_PID=$!

sleep 1.5
echo "Abriendo aplicación en el navegador..."
open "http://localhost:5050"

echo ""
echo "✓ Motor Local activo con FFmpeg y recursos nativos de tu Mac."
echo "Para detener el servidor, presiona Ctrl + C o cierra esta ventana."
wait $SERVER_PID
