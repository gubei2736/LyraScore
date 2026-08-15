package com.lyrascore.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * LyraScore 现代化平板原生宿主 Activity
 * 具备沉浸式常亮视奏、原生文件导入选择器、多点触控放通与系统侧滑返回智能拦截
 */
public class MainActivity extends Activity {
    private static final String TAG = "LyraScore";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> mFilePathCallback;

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. 平板演奏专用：屏幕常亮 + 隐藏状态栏沉浸式
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUI();

        // 2. 初始化 WebView
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#fbf8f1")); // 羊皮纸护眼底色，杜绝闪白
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null); // 绑定 GPU 硬件加速光栅化管道
        setContentView(webView);

        // 3. 深度配置 WebSettings (放行本地离线文件跨域与 ES 脚本运行)
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        // 禁用 WebView 原生抢占式缩放，将双指 Pinch-to-Zoom 原始触摸事件 100% 交付前端乐谱引擎
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // 4. 支持 Android 13/14/15/16 预测性返回手势与侧滑拦截
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        handleBackAction();
                    }
                }
            );
        }

        // 5. 原生系统文件导入选择器通道 (PDF / MusicXML / 图片)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");

                String[] mimeTypes = {
                        "application/pdf",
                        "text/xml",
                        "application/xml",
                        "image/*",
                        "application/octet-stream",
                        "application/vnd.recordare.musicxml+xml",
                        "application/vnd.recordare.musicxml"
                };
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "选择要导入的乐谱文件 (PDF / MusicXML / 图片)"), FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    Log.e(TAG, "无法打开系统文件选择器", e);
                    if (mFilePathCallback != null) {
                        mFilePathCallback.onReceiveValue(null);
                        mFilePathCallback = null;
                    }
                    return false;
                }
                return true;
            }
        });

        // 6. 异常拦截与诊断处理
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Log.e(TAG, "[WebView Error] " + error.getDescription() + " for " + request.getUrl());
                }
            }
        });

        // 7. 加载本地离线 Web 乐谱工作台
        webView.loadUrl("file:///android_asset/dist/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (mFilePathCallback == null) return;

            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                ClipData clipData = data.getClipData();
                if (clipData != null && clipData.getItemCount() > 0) {
                    int count = clipData.getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }

            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
        }
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    /**
     * 统一处理系统侧滑返回与物理返回键：
     * 若处于乐谱阅读界面，侧滑返回书架主页；若在主页，返回桌面
     */
    private void handleBackAction() {
        if (webView != null) {
            webView.evaluateJavascript("(function(){ if (window.onAndroidBackPressed) { return window.onAndroidBackPressed(); } return false; })()", new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if ("true".equals(value) || "\"true\"".equals(value)) {
                        // 成功返回书架主页
                        return;
                    }
                    finish();
                }
            });
            return;
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        handleBackAction();
    }
}
