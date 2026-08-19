package com.kirokubox.seasonaldiarywidget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        Uri data = intent.getData();
        if (data != null && "seasonaldiary".equals(data.getScheme()) && "widget".equals(data.getHost())) {
            getSharedPreferences(SeasonalDiaryWidgetProvider.PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString("sleep", safe(data.getQueryParameter("sleep")))
                .putString("remaining", safe(data.getQueryParameter("remaining")))
                .putString("yesterday", safe(data.getQueryParameter("yesterday")))
                .putString("updated", safe(data.getQueryParameter("updated")))
                .apply();
            SeasonalDiaryWidgetProvider.updateAll(this);
            Toast.makeText(this, "季節日記ウィジェットを更新しました", Toast.LENGTH_SHORT).show();
        }
        finish();
    }

    private String safe(String value) {
        return value == null || value.isEmpty() ? "−" : value;
    }
}
