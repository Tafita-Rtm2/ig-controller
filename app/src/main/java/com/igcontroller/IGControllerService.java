package com.igcontroller;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;
import org.json.JSONObject;
import java.io.*;
import java.util.Timer;
import java.util.TimerTask;

public class IGControllerService extends AccessibilityService {
    private static final String TAG = "IGController";
    private static final String CMD_FILE = "/sdcard/cmd.json";
    private static final String RESULT_FILE = "/sdcard/cmd_result.json";
    private Timer timer;
    private long lastModified = 0;

    @Override
    public void onServiceConnected() {
        Log.d(TAG, "Service connecte!");
        writeResult("ready", "Service IGController actif");
        startWatching();
    }

    private void startWatching() {
        timer = new Timer();
        timer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() { checkCommand(); }
        }, 0, 300);
    }

    private void checkCommand() {
        try {
            File f = new File(CMD_FILE);
            if (!f.exists()) return;
            if (f.lastModified() == lastModified) return;
            lastModified = f.lastModified();
            StringBuilder sb = new StringBuilder();
            BufferedReader br = new BufferedReader(new FileReader(f));
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            String content = sb.toString().trim();
            if (content.isEmpty()) return;
            JSONObject cmd = new JSONObject(content);
            String action = cmd.getString("action");
            new Handler(Looper.getMainLooper()).post(() -> {
                try { executeCommand(action, cmd); }
                catch (Exception e) { writeResult("error", e.getMessage()); }
            });
        } catch (Exception e) {
            Log.e(TAG, "Erreur: " + e.getMessage());
        }
    }

    private void executeCommand(String action, JSONObject cmd) throws Exception {
        switch (action) {
            case "tap":
                tap(cmd.getInt("x"), cmd.getInt("y"));
                writeResult("ok", "tap");
                break;
            case "find_and_tap":
                boolean found = findAndTap(cmd.getString("text"));
                writeResult(found ? "ok" : "not_found", cmd.getString("text"));
                break;
            case "find_and_type":
                boolean typed = findAndType(cmd.getString("hint"), cmd.getString("text"));
                writeResult(typed ? "ok" : "not_found", "typed");
                break;
            case "clear_and_type":
                boolean cleared = clearAndType(cmd.getString("hint"), cmd.getString("text"));
                writeResult(cleared ? "ok" : "not_found", "cleared");
                break;
            case "screenshot_nodes":
                writeResult("ok", dumpNodes());
                break;
            case "launch_app":
                launchApp(cmd.getString("package"));
                writeResult("ok", "launched");
                break;
            case "back":
                performGlobalAction(GLOBAL_ACTION_BACK);
                writeResult("ok", "back");
                break;
            case "home":
                performGlobalAction(GLOBAL_ACTION_HOME);
                writeResult("ok", "home");
                break;
            case "swipe":
                swipe(cmd.getInt("x1"), cmd.getInt("y1"), cmd.getInt("x2"), cmd.getInt("y2"));
                writeResult("ok", "swiped");
                break;
            default:
                writeResult("unknown", action);
        }
    }

    private void tap(int x, int y) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            GestureDescription.Builder b = new GestureDescription.Builder();
            Path p = new Path(); p.moveTo(x, y);
            b.addStroke(new GestureDescription.StrokeDescription(p, 0, 100));
            dispatchGesture(b.build(), null, null);
        }
    }

    private void swipe(int x1, int y1, int x2, int y2) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            GestureDescription.Builder b = new GestureDescription.Builder();
            Path p = new Path(); p.moveTo(x1, y1); p.lineTo(x2, y2);
            b.addStroke(new GestureDescription.StrokeDescription(p, 0, 300));
            dispatchGesture(b.build(), null, null);
        }
    }

    private boolean findAndTap(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo node = findNodeByText(root, text);
        if (node != null) {
            Rect r = new Rect(); node.getBoundsInScreen(r);
            tap(r.centerX(), r.centerY()); return true;
        }
        return false;
    }

    private boolean findAndType(String hint, String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo node = findNodeByHint(root, hint);
        if (node == null) node = findNodeByText(root, hint);
        if (node != null) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            android.os.Bundle args = new android.os.Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            return true;
        }
        return false;
    }

    private boolean clearAndType(String hint, String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo node = findNodeByHint(root, hint);
        if (node == null) node = findNodeByText(root, hint);
        if (node != null) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            android.os.Bundle args0 = new android.os.Bundle();
            args0.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "");
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args0);
            android.os.Bundle args = new android.os.Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            return true;
        }
        return false;
    }

    private void launchApp(String pkg) {
        android.content.Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
        if (i != null) {
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getApplicationContext().startActivity(i);
        }
    }

    private AccessibilityNodeInfo findNodeByText(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if (node.getText() != null && node.getText().toString().toLowerCase().contains(text.toLowerCase())) return node;
        if (node.getContentDescription() != null && node.getContentDescription().toString().toLowerCase().contains(text.toLowerCase())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo r = findNodeByText(node.getChild(i), text);
            if (r != null) return r;
        }
        return null;
    }

    private AccessibilityNodeInfo findNodeByHint(AccessibilityNodeInfo node, String hint) {
        if (node == null) return null;
        if (node.getHintText() != null && node.getHintText().toString().toLowerCase().contains(hint.toLowerCase())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo r = findNodeByHint(node.getChild(i), hint);
            if (r != null) return r;
        }
        return null;
    }

    private String dumpNodes() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        dumpNode(root, sb, 0);
        sb.append("]");
        return sb.toString();
    }

    private void dumpNode(AccessibilityNodeInfo node, StringBuilder sb, int depth) {
        if (node == null || depth > 10) return;
        Rect r = new Rect(); node.getBoundsInScreen(r);
        String text = node.getText() != null ? node.getText().toString() : "";
        String hint = node.getHintText() != null ? node.getHintText().toString() : "";
        String desc = node.getContentDescription() != null ? node.getContentDescription().toString() : "";
        if (!text.isEmpty() || !hint.isEmpty() || !desc.isEmpty()) {
            sb.append("{\"text\":\"").append(text.replace("\"", ""))
              .append("\",\"hint\":\"").append(hint.replace("\"", ""))
              .append("\",\"desc\":\"").append(desc.replace("\"", ""))
              .append("\",\"x\":").append(r.centerX())
              .append(",\"y\":").append(r.centerY()).append("},");
        }
        for (int i = 0; i < node.getChildCount(); i++) dumpNode(node.getChild(i), sb, depth + 1);
    }

    private void writeResult(String status, String message) {
        try {
            JSONObject result = new JSONObject();
            result.put("status", status);
            result.put("message", message != null ? message.substring(0, Math.min(message.length(), 500)) : "");
            result.put("ts", System.currentTimeMillis());
            FileWriter fw = new FileWriter(RESULT_FILE);
            fw.write(result.toString());
            fw.close();
        } catch (Exception e) {
            Log.e(TAG, "writeResult: " + e.getMessage());
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
    @Override public void onInterrupt() {}
    @Override public void onDestroy() {
        if (timer != null) timer.cancel();
        super.onDestroy();
    }
}
