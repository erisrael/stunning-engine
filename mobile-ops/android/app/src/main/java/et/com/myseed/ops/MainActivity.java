package et.com.myseed.ops;

import android.app.DownloadManager;
import android.content.ContentValues;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.PowerManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.View;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

// Myseed Ops: the whole Ops app (ops.myseed.com.et) in an Android app. Capacitor shows the site, asks Android for the
// camera, microphone and location when a page needs them (QR check-in, calls, check-in area), keeps the sign-in
// between launches, opens links to other sites in the browser and handles the Back button (the App plugin).
// Files the site sends (exports, reports, payslips) are saved to Downloads with the person's sign-in; files the page
// makes itself (Excel, CSV and PDF exports) come through MyseedAndroid.save (src/components/app/android-bridge.tsx).
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView web = getBridge().getWebView();
    // The page always fits the screen: no pinch or zoom buttons, and the phone's font size does not stretch the page
    // wider than the screen (people set the text size in the app's Settings instead).
    WebSettings s = web.getSettings();
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setDisplayZoomControls(false);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(false);
    s.setTextZoom(100);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setHorizontalScrollBarEnabled(false);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    web.addJavascriptInterface(new Saver(), "MyseedAndroid");
    web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
      if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
        Toast.makeText(this, "This file can only be saved from the website.", Toast.LENGTH_LONG).show();
        return;
      }
      try {
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
        req.setMimeType(mimeType);
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) req.addRequestHeader("Cookie", cookies);
        req.addRequestHeader("User-Agent", userAgent);
        req.setTitle(name);
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        dm.enqueue(req);
        Toast.makeText(this, "Downloading " + name, Toast.LENGTH_SHORT).show();
      } catch (Exception e) {
        Toast.makeText(this, "The file could not be saved.", Toast.LENGTH_LONG).show();
      }
    });
  }

  // During a voice call: the proximity sensor turns the screen off (and its touches with it) while the phone is at the
  // ear, as in a phone call, and the sound goes to the earpiece or the loudspeaker for real (audio-route.tsx).
  private PowerManager.WakeLock proximity;

  private void setSpeaker(boolean on) {
    AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
    if (am == null) return;
    if (Build.VERSION.SDK_INT >= 31) {
      int want = on ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
      for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
        if (d.getType() == want) {
          am.setCommunicationDevice(d);
          return;
        }
      }
    } else {
      am.setSpeakerphoneOn(on);
    }
  }

  // The page's bridge to the phone (window.MyseedAndroid): saving files, and the call controls.
  private class Saver {
    @JavascriptInterface
    public boolean callProximity(boolean on) {
      try {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (on) {
          if (am != null) am.setMode(AudioManager.MODE_IN_COMMUNICATION);
          if (pm == null || !pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return false;
          synchronized (MainActivity.this) {
            if (proximity == null) proximity = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "myseed:call");
            if (!proximity.isHeld()) proximity.acquire(4 * 60 * 60 * 1000L);
          }
          return true;
        }
        synchronized (MainActivity.this) {
          if (proximity != null && proximity.isHeld()) proximity.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY);
        }
        if (am != null) {
          if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
          else am.setSpeakerphoneOn(false);
          am.setMode(AudioManager.MODE_NORMAL);
        }
        return true;
      } catch (Exception e) {
        return false;
      }
    }

    @JavascriptInterface
    public void callSpeaker(boolean on) {
      try {
        setSpeaker(on);
      } catch (Exception ignored) {
      }
    }

    @JavascriptInterface
    public void save(String base64, String name, String mime) {
      String file = (name == null || name.trim().isEmpty()) ? "download" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
      String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
      try {
        byte[] data = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
        // The page could not read the file: say so rather than save an empty one.
        if (data.length == 0) throw new Exception("empty");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          ContentValues v = new ContentValues();
          v.put(MediaStore.Downloads.DISPLAY_NAME, file);
          v.put(MediaStore.Downloads.MIME_TYPE, type);
          v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
          Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
          if (uri == null) throw new Exception("no uri");
          try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            out.write(data);
          }
        } else {
          File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
          try (FileOutputStream out = new FileOutputStream(new File(dir, file))) {
            out.write(data);
          }
        }
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads: " + file, Toast.LENGTH_SHORT).show());
      } catch (Exception e) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "The file could not be saved.", Toast.LENGTH_LONG).show());
      }
    }
  }

  @Override
  public void onDestroy() {
    // A call screen closed with the app: give the screen and the sound back.
    synchronized (this) {
      if (proximity != null && proximity.isHeld()) proximity.release();
    }
    AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
    if (am != null) am.setMode(AudioManager.MODE_NORMAL);
    super.onDestroy();
  }

  @Override
  public void onPause() {
    super.onPause();
    // Keep the sign-in if Android closes the app in the background.
    CookieManager.getInstance().flush();
  }
}
