package com.kirokubox.seasonaldiarywidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

public class SeasonalDiaryWidgetProvider extends AppWidgetProvider {
    static final String PREFS_NAME = "seasonal_diary_widget";
    private static final String APP_URL = "https://kirokubox.github.io/diary-app/";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) update(context, manager, appWidgetId);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, SeasonalDiaryWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(provider)) update(context, manager, id);
    }

    private static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String sleep = prefs.getString("sleep", "−");
        String remaining = prefs.getString("remaining", "−");
        String yesterday = prefs.getString("yesterday", "−");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.seasonal_diary_widget);
        views.setTextViewText(R.id.widget_text, "💤" + sleep + "   💰" + remaining + "   💸" + yesterday);

        Intent openApp = new Intent(Intent.ACTION_VIEW, Uri.parse(APP_URL));
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        manager.updateAppWidget(appWidgetId, views);
    }
}
