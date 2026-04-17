#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "MAX30105.h"
#include "heartRate.h"

// SETTINGS
const char *ssid = process.env.SSID;               // Change value accordingly
const char *password = process.env.PASSWORD;       // Change value accordingly
const char *mqtt_server = process.env.MQTT_SERVER; // Change value accordingly
const char *mqtt_topic = process.env.MQTT_TOPIC;   // Change value accordingly

#define ONE_WIRE_BUS 4
LiquidCrystal_I2C lcd(0x27, 16, 2);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
MAX30105 particleSensor;

WiFiClient espClient;
PubSubClient client(espClient);

long lastBeat = 0;
int beatAvg = 0;
int spo2 = 0;
float bodyTemp = 0;
unsigned long lastUpdate = 0;
unsigned long lastBeatDetectedTime = 0;

void setup()
{
  Serial.begin(115200);
  Wire.begin(21, 22);

  lcd.init();
  lcd.backlight();
  lcd.print("System Loading");

  sensors.begin();

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST))
  {
    lcd.clear();
    lcd.print("MAX30102 Error");
    while (1)
      ;
  }

  byte ledBrightness = 70;
  byte sampleAverage = 1;
  byte ledMode = 2;
  int sampleRate = 400;
  int pulseWidth = 411;
  int adcRange = 4096;
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);

  WiFi.begin(ssid, password);
  client.setServer(mqtt_server, 1883);
}

void loop()
{
  long irValue = particleSensor.getIR();
  long redValue = particleSensor.getRed();

  if (checkForBeat(irValue) == true)
  {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    float bpm = 60 / (delta / 1000.0);

    if (bpm < 200 && bpm > 40)
    {
      beatAvg = (int)bpm;
      lastBeatDetectedTime = millis();
      Serial.print("Beat! BPM: ");
      Serial.println(beatAvg);
    }
  }

  if (!client.connected() && WiFi.status() == WL_CONNECTED)
  {
    client.connect("ESP32_Health_Node");
  }
  client.loop();

  if (millis() - lastUpdate > 2000)
  {
    sensors.requestTemperatures();
    bodyTemp = sensors.getTempCByIndex(0);

    // SpO2
    if (irValue > 50000)
    {
      float ratio = (float)redValue / (float)irValue;
      spo2 = 110 - (21 * ratio);
      if (spo2 > 100)
        spo2 = 100;
    }
    else
    {
      spo2 = 0;
    }

    // LCD Display
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("T:");
    if (bodyTemp <= -120)
      lcd.print("--");
    else
      lcd.print(bodyTemp, 1);
    lcd.print("C SpO2:");
    if (irValue < 50000)
      lcd.print("---");
    else
    {
      lcd.print(spo2);
      lcd.print("%");
    }

    lcd.setCursor(0, 1);
    lcd.print("HR:");

    if (irValue < 50000)
    {
      lcd.print("---");
      beatAvg = 0;
    }
    else if (millis() - lastBeatDetectedTime > 10000)
    {
      lcd.print("---");
    }
    else
    {
      lcd.print(beatAvg);
    }

    lcd.setCursor(9, 1);
    lcd.print("MQTT:");
    lcd.print(client.connected() ? "ON" : "OFF");

    // MQTT
    if (client.connected())
    {
      StaticJsonDocument<200> doc;
      doc["temp"] = (bodyTemp <= -120) ? 0 : bodyTemp;
      doc["spo2"] = (irValue < 50000) ? 0 : spo2;
      doc["bpm"] = (irValue < 50000 || (millis() - lastBeatDetectedTime > 10000)) ? 0 : beatAvg;

      char buffer[200];
      serializeJson(doc, buffer);
      client.publish(mqtt_topic, buffer);
    }

    lastUpdate = millis();
  }
}