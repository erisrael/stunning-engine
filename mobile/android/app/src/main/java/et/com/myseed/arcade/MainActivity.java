package et.com.myseed.arcade;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Myseed Arcade: the guest arcade full screen (no status or navigation bar), the screen kept on, and the app pinned
// to the screen (Android's screen pinning) so a customer cannot leave it. Staff unpin with the phone's own gesture
// (hold Back and Overview, or swipe up and hold) and the phone's PIN; on a phone set up as a dedicated device
// (device owner) the pin needs no confirmation at all.
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    immersive();
  }

  @Override
  public void onResume() {
    super.onResume();
    immersive();
    try {
      startLockTask();
    } catch (Exception ignored) {
      // Pinning not allowed on this device: the arcade still has no way out of its own.
    }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
  }

  private void immersive() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    c.hide(WindowInsetsCompat.Type.systemBars());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
  }
}
