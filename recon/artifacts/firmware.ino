#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Pin definitions
#define TMP36_PIN          34      // Analog input (GPIO34)
#define I2C_SDA            21
#define I2C_SCL            22
#define BUTTON_PIN         0       // GPIO0 (boot button) – can be changed
#define OLED_RESET         -1      // Not used with this module

// OLED parameters
#define SCREEN_WIDTH       128
#define SCREEN_HEIGHT      64
#define OLED_I2C_ADDR      0x3C

// Button debounce
#define DEBOUNCE_MS        50

// State machine
enum DisplayMode {MODE_CELSIUS, MODE_FAHRENHEIT};
DisplayMode currentMode = MODE_CELSIUS;

// Global objects
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Button handling
volatile uint32_t lastButtonPress = 0;
volatile bool buttonFlag = false;

// Interrupt service routine for button (optional)
void IRAM_ATTR buttonISR() {
  uint32_t now = millis();
  if (now - lastButtonPress > DEBOUNCE_MS) {
    buttonFlag = true;
    lastButtonPress = now;
  }
}

// Convert ADC reading to temperature in Celsius
float readTemperatureC() {
  int raw = analogRead(TMP36_PIN);
  float voltage = (raw * 3.3) / 4095.0;        // ESP32 ADC range 0‑3.3V, 12‑bit
  float tempC = (voltage - 0.5) * 100.0;       // TMP36: 10mV/°C, 500mV offset
  return tempC;
}

// Convert Celsius to Fahrenheit
float cToF(float c) {
  return c * 1.8 + 32.0;
}

// Update OLED display
void updateDisplay(float temperature) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  if (currentMode == MODE_CELSIUS) {
    display.print(temperature, 1);
    display.print(" C");
  } else {
    display.print(cToF(temperature), 1);
    display.print(" F");
  }
  display.display();
}

void setup() {
  // Serial for debugging (optional)
  Serial.begin(115200);
  delay(1000);
  Serial.println("ESP32 Temperature Monitor");

  // ADC configuration
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // Full range 0‑3.3V

  // Button setup
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);

  // I2C and OLED init
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;) ; // Halt
  }
  display.clearDisplay();
  display.display();

  // Initial display
  float temp = readTemperatureC();
  updateDisplay(temp);
}

void loop() {
  // Handle button press to toggle display mode
  if (buttonFlag) {
    buttonFlag = false;
    currentMode = (currentMode == MODE_CELSIUS) ? MODE_FAHRENHEIT : MODE_CELSIUS;
    // Force immediate update after mode change
    float temp = readTemperatureC();
    updateDisplay(temp);
  }

  // Periodic temperature reading (e.g., every 1 second)
  static uint32_t lastUpdate = 0;
  uint32_t now = millis();
  if (now - lastUpdate >= 1000) {
    lastUpdate = now;
    float tempC = readTemperatureC();
    updateDisplay(tempC);
  }

  // Add a short delay to reduce CPU usage
  delay(10);
}

/*
Improvements:
- Apply a moving average filter to the ADC readings to reduce noise.
- Calibrate the TMP36 offset and scale for more accurate temperature.
- Use deep sleep between measurements to lower power consumption.
- Add a second button for setting alarm thresholds and display alerts.
- Store configuration (e.g., display mode) in NVS to retain after reset.
- Replace blocking delay() with a non‑blocking timer (e.g., esp_timer) for better responsiveness.
- Use the ESP32's built‑in temperature sensor as a redundancy check.
*/
