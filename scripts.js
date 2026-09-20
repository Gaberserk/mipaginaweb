const API_URL = 'http://localhost:11434/api/generate';
const MODEL = 'mistral'; // Cambia a 'llama2' si prefieres

const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

const SYSTEM_PROMPT = `Eres un experto en Godot 4.7.2 y GDScript.
Proporciona respuestas claras y prácticas con ejemplos de código.
Responde en español.
Sé conciso pero completo.`;

// Enviar con click en botón
sendBtn.addEventListener('click', () => {
    const mensaje = userInput.value.trim();
    if (mensaje) {
        enviarMensaje(mensaje);
        userInput.value = '';
    }
});

// Enviar con Enter (Shift+Enter = nueva línea)
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

async function enviarMensaje(mensaje) {
    // Mostrar mensaje del usuario
    agregarMensaje(mensaje, 'user');
    sendBtn.disabled = true;

    // Mostrar indicador de carga
    const loadingDiv = agregarCargando();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                system: SYSTEM_PROMPT,
                prompt: mensaje,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error('❌ Error conectando con Ollama. ¿Está corriendo?');
        }

        const data = await response.json();
        const respuesta = data.response;

        // Remover cargando y mostrar respuesta
        loadingDiv.remove();
        agregarMensaje(respuesta, 'ai');

    } catch (error) {
        loadingDiv.remove();
        agregarMensaje(`❌ Error: ${error.message}`, 'ai');
        console.error('Error:', error);
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}

function agregarMensaje(texto, tipo) {
    const div = document.createElement('div');
    div.className = `message ${tipo}`;
    
    // Convertir markdown simple a HTML
    texto = texto.replace(/```([\s\S]*?)```/g, 
        '<pre><code>$1</code></pre>');
    texto = texto.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    div.innerHTML = texto;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function agregarCargando() {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
}

function pregunta(texto) {
    userInput.value = texto;
    sendBtn.click();
}
