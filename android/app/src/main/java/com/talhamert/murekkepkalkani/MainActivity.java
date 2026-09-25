package com.talhamert.murekkepkalkani;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Oyun penceresi: tam ekran (sürükleyince geçici görünen sistem çubukları),
 * oyun sırasında ekran kararmaz, çentikli ekranlarda kenardan kenara çizim,
 * yüksek yenilemeli ekranlarda sabit 60 Hz (kare atlamasız, akıcı ve serin).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        prefer60Hz();
        enterImmersive();
    }

    /**
     * 90/120/144 Hz ekranlarda aynı çözünürlükteki 60 Hz modunu iste. Oyun sabit 60 FPS'te
     * koşar: WebView yetişemeyince 60-120 arası zıplayan (takılgan hissettiren) kare hızı olmaz.
     */
    private void prefer60Hz() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode current = display.getMode();
            Display.Mode best = null;
            for (Display.Mode m : display.getSupportedModes()) {
                if (m.getPhysicalWidth() != current.getPhysicalWidth() || m.getPhysicalHeight() != current.getPhysicalHeight()) continue;
                float hz = m.getRefreshRate();
                if (hz < 59f) continue;
                if (best == null || Math.abs(hz - 60f) < Math.abs(best.getRefreshRate() - 60f)) best = m;
            }
            if (best != null && best.getModeId() != current.getModeId()) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.preferredDisplayModeId = best.getModeId();
                getWindow().setAttributes(lp);
            }
        } catch (Exception ignored) {
            // bazı emülatör/cihazlar mod listesi vermez: varsayılanla devam
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    private void enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
