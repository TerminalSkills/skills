---
name: selenium
description: When the user wants to automate browser testing across multiple browsers using Selenium WebDriver. Also use when the user mentions "selenium," "WebDriver," "browser automation," "cross-browser testing," "browser testing," "headless Chrome testing," or "Selenium Grid." For mobile testing, see appium.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - browser-automation
    - e2e-testing
    - cross-browser
    - webdriver
---

# Selenium

## Overview

You are an expert in Selenium WebDriver for browser automation and testing. You help users write reliable browser tests in their language of choice (JavaScript, Python, Java, C#), set up Selenium Grid for parallel/cross-browser execution, implement the Page Object Model pattern, handle waits properly, and integrate tests into CI pipelines.

## Instructions

### Initial Assessment

1. **Language** — JavaScript, Python, Java, or C#?
2. **Browsers** — Which browsers need testing? (Chrome, Firefox, Safari, Edge)
3. **Framework** — Test runner? (Jest, pytest, JUnit, NUnit)
4. **Infrastructure** — Local, Selenium Grid, or cloud (BrowserStack, Sauce Labs)?

### Python with pytest

```python
# tests/test_login.py — Selenium login test using Python and pytest.
# Uses explicit waits for reliable element interaction.
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

@pytest.fixture
def driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    d = webdriver.Chrome(options=options)
    d.implicitly_wait(10)
    yield d
    d.quit()

def test_login_success(driver):
    driver.get("https://example.com/login")

    wait = WebDriverWait(driver, 10)
    email = wait.until(EC.presence_of_element_located((By.ID, "email")))
    email.send_keys("user@example.com")

    password = driver.find_element(By.ID, "password")
    password.send_keys("securePassword123")

    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

    header = wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dashboard-header")))
    assert "Welcome back" in header.text
```

### Page Object Model

```python
# pages/login_page.py — Page Object for the login page.
# Encapsulates selectors and actions for maintainable tests.
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class LoginPage:
    URL = "/login"
    EMAIL_INPUT = (By.ID, "email")
    PASSWORD_INPUT = (By.ID, "password")
    SUBMIT_BUTTON = (By.CSS_SELECTOR, "button[type='submit']")
    ERROR_MESSAGE = (By.CLASS_NAME, "error-message")

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def navigate(self):
        self.driver.get(f"https://example.com{self.URL}")
        return self

    def login(self, email, password):
        self.wait.until(EC.presence_of_element_located(self.EMAIL_INPUT)).send_keys(email)
        self.driver.find_element(*self.PASSWORD_INPUT).send_keys(password)
        self.driver.find_element(*self.SUBMIT_BUTTON).click()
        return self

    def get_error(self):
        return self.wait.until(EC.presence_of_element_located(self.ERROR_MESSAGE)).text
```

### JavaScript with WebDriverIO

```javascript
// tests/login.spec.js — Selenium-based login test using WebDriverIO.
// Tests successful login and verifies the dashboard loads.
describe('Login Page', () => {
  it('should log in with valid credentials', async () => {
    await browser.url('/login');

    const emailInput = await $('#email');
    await emailInput.waitForDisplayed({ timeout: 5000 });
    await emailInput.setValue('user@example.com');

    const passwordInput = await $('#password');
    await passwordInput.setValue('securePassword123');

    const submitBtn = await $('button[type="submit"]');
    await submitBtn.click();

    const dashboard = await $('.dashboard-header');
    await dashboard.waitForDisplayed({ timeout: 10000 });
    await expect(dashboard).toHaveText('Welcome back');
  });
});
```

### Selenium Grid with Docker

```yaml
# docker-compose.yml — Selenium Grid with Chrome and Firefox nodes.
# Enables parallel cross-browser testing locally.
services:
  selenium-hub:
    image: selenium/hub:4.18
    ports:
      - "4442:4442"
      - "4443:4443"
      - "4444:4444"
  chrome:
    image: selenium/node-chrome:4.18
    depends_on:
      - selenium-hub
    environment:
      - SE_EVENT_BUS_HOST=selenium-hub
      - SE_EVENT_BUS_PUBLISH_PORT=4442
      - SE_EVENT_BUS_SUBSCRIBE_PORT=4443
      - SE_NODE_MAX_SESSIONS=4
  firefox:
    image: selenium/node-firefox:4.18
    depends_on:
      - selenium-hub
    environment:
      - SE_EVENT_BUS_HOST=selenium-hub
      - SE_EVENT_BUS_PUBLISH_PORT=4442
      - SE_EVENT_BUS_SUBSCRIBE_PORT=4443
      - SE_NODE_MAX_SESSIONS=4
```

### CI Integration

```yaml
# .github/workflows/selenium.yml — Run Selenium tests in CI with headless Chrome.
# Uses a service container for Selenium standalone.
name: Browser Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      selenium:
        image: selenium/standalone-chrome:4.18
        ports:
          - 4444:4444
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install selenium pytest
      - run: pytest tests/ --tb=short
```
