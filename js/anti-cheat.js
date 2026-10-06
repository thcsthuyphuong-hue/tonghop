// Chống gian lận: giữ nguyên các trigger visibility/blur/resize.
import { state } from "./state.js";

export const setupAntiCheat = (calculateResult) => {
    const triggerCheat = () => {
        if (state.canCheckCheat && state.isQuizRunning && state.mode === 'test' && !state.isProcessingCheat) {
            state.isProcessingCheat = true;
            state.isQuizRunning = false;
            calculateResult();
            document.getElementById('cheat-modal').style.display = 'flex';
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (state.canCheckCheat && state.isQuizRunning && state.mode === 'test' && document.visibilityState === 'hidden') {
            triggerCheat();
        }
    });

    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (state.canCheckCheat && state.isQuizRunning && state.mode === 'test' && !document.hasFocus()) {
                triggerCheat();
            }
        }, 200);
    });

    window.addEventListener('resize', () => {
        if (state.canCheckCheat && state.isQuizRunning && state.mode === 'test') {
            if (Math.abs(window.innerWidth - (window.testInitialWidth || window.innerWidth)) > 150) {
                triggerCheat();
            }
        }
    });
};
