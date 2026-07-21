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
import android.widget.TextClock
import android.widget.TextView
import java.util.Date

/**
 * Full-screen, must-dismiss alarm UI shown over the lock screen. Styled like the
 * platform's default alarm screen — dark neutral background, the alarm's label
 * (event emoji + name) as the title, a big live clock — so it reads correctly at
 * any hour, not just morning (spec 2026-07-21-alarm-screen-event-name-design).
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
    // Honors the device 12/24-hour preference, unlike a fixed HH:mm pattern.
    val timeFmt = android.text.format.DateFormat.getTimeFormat(this)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      layoutParams = ViewGroup.LayoutParams(match, match)
      setPadding(48, 64, 48, 64)
      setBackgroundColor(Color.parseColor("#0E1116"))
    }

    // Which alarm fired — the pill label (event emoji + name) is the title, the
    // way the platform's default alarm screen leads with the alarm's own label.
    val entry = firingId?.let { AlarmController.findAlarm(applicationContext, it) }
    val label = entry?.label.orEmpty()
    val title = TextView(this).apply {
      text = label.ifBlank { getString(R.string.fallback_ring_title) }
      textSize = 22f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    // Live clock: TextClock ticks by itself and follows the 12/24-hour setting.
    // Bare time (no AM/PM) like the lock-screen clock.
    val clock = TextClock(this).apply {
      format12Hour = "h:mm"
      format24Hour = "HH:mm"
      textSize = 76f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 16, 0, 0)
    }

    // Spacers above and below keep the title/clock block vertically centered,
    // with the dismiss pill pinned to the bottom.
    root.addView(android.view.View(this), LinearLayout.LayoutParams(0, 0, 1f))
    root.addView(title)
    root.addView(clock)

    // Leave-home countdown chip — only when a future leave instant is known.
    val leaveAt = entry?.leaveAt ?: 0L
    val now = System.currentTimeMillis()
    if (leaveAt > now) {
      val minutesLeft = ((leaveAt - now) / 60000L).toInt()
      val chip = TextView(this).apply {
        text = getString(R.string.ring_leave_chip, timeFmt.format(Date(leaveAt)), minutesLeft)
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

    root.addView(android.view.View(this), LinearLayout.LayoutParams(0, 0, 1f))

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
