package expo.modules.schedularmalarm

import android.app.Activity
import android.app.KeyguardManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Full-screen, must-dismiss alarm UI shown over the lock screen ("Soft Sky":
 * night-to-sunrise gradient — spec 2026-06-12-soft-sky-visual-design §2.4).
 * Layout is built in code so the module needs no bundled drawable/layout assets;
 * strings come from res/values{,-ko}/strings.xml so the OS localizes them.
 */
class AlarmActivity : Activity() {
  private var firingId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    firingId = intent?.getStringExtra(AlarmConstants.EXTRA_ALARM_ID)
    showOverLockScreen()
    setContentView(buildView())
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(KEYGUARD_SERVICE) as KeyguardManager)
        .requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildView(): LinearLayout {
    val match = ViewGroup.LayoutParams.MATCH_PARENT
    val clockFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      layoutParams = ViewGroup.LayoutParams(match, match)
      setPadding(48, 160, 48, 64)
      background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(0xFF2C7BD4.toInt(), 0xFF4FA8FF.toInt(), 0xFFFFB84C.toInt())
      )
    }

    val sun = TextView(this).apply {
      text = "☀️"
      textSize = 34f
      gravity = Gravity.CENTER
    }
    val greeting = TextView(this).apply {
      text = getString(R.string.ring_greeting)
      textSize = 22f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 0)
    }
    val subtitle = TextView(this).apply {
      text = getString(R.string.ring_subtitle)
      textSize = 14f
      setTextColor(Color.parseColor("#EAF4FF"))
      gravity = Gravity.CENTER
      setPadding(0, 4, 0, 0)
    }

    // Which alarm fired (the pill label) — distinguishes one alarm from another.
    val entry = firingId?.let { AlarmController.findAlarm(applicationContext, it) }
    val label = entry?.label.orEmpty()
    val clock = TextView(this).apply {
      text = clockFmt.format(Date())
      textSize = 64f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 0)
    }

    root.addView(sun)
    root.addView(greeting)
    root.addView(subtitle)
    if (label.isNotBlank()) {
      val labelView = TextView(this).apply {
        text = label
        textSize = 15f
        setTextColor(Color.WHITE)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(0, 10, 0, 0)
      }
      root.addView(labelView)
    }
    root.addView(clock)

    // Leave-home countdown chip — only when a future leave instant is known.
    val leaveAt = entry?.leaveAt ?: 0L
    val now = System.currentTimeMillis()
    if (leaveAt > now) {
      val minutesLeft = ((leaveAt - now) / 60000L).toInt()
      val chip = TextView(this).apply {
        text = getString(R.string.ring_leave_chip, clockFmt.format(Date(leaveAt)), minutesLeft)
        textSize = 13f
        setTextColor(Color.WHITE)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(40, 14, 40, 14)
        background = GradientDrawable().apply {
          cornerRadius = 999f
          setColor(0x2EFFFFFF)
        }
      }
      val chipParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = 28 }
      root.addView(chip, chipParams)
    }

    // Spacer pushes the dismiss pill to the bottom.
    val spacer = android.view.View(this)
    root.addView(spacer, LinearLayout.LayoutParams(0, 0, 1f))

    val dismiss = TextView(this).apply {
      text = getString(R.string.ring_dismiss)
      textSize = 17f
      setTextColor(Color.parseColor("#2C7BD4"))
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 44, 0, 44)
      background = GradientDrawable().apply {
        cornerRadius = 999f
        setColor(Color.WHITE)
      }
      setOnClickListener { dismissAlarm() }
    }
    root.addView(dismiss, LinearLayout.LayoutParams(match, ViewGroup.LayoutParams.WRAP_CONTENT))

    return root
  }

  private fun dismissAlarm() {
    // Dismiss only the alarm that rang (known id) or just silence the ring
    // (unknown id) — never cancel the whole set. See AlarmController.dismissFired.
    AlarmController.dismissFired(applicationContext, firingId)
    finish()
  }

  // Must-dismiss: ignore Back so the alarm can't be swiped/backed away.
  @Suppress("OVERRIDE_DEPRECATION", "MissingSuperCall")
  override fun onBackPressed() {
    // no-op
  }
}
