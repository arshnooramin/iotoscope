# Internet of Things Oscilloscope

ESP32-based IoT Oscilloscope

## Purpose
An oscilloscope is an essential tool for professionals in a variety of fields, especially for Electrical and Computer Engineers. Handheld oscilloscopes like the [Analog Discovery](https://digilent.com/shop/analog-discovery-2-100ms-s-usb-oscilloscope-logic-analyzer-and-variable-power-supply/) have revolutionized the workflow of ECEs through USB oscilloscopes that provide an easy-to-use interface. 

This project takes the approach of Analog Discovery to the next level by introducing a handheld oscilloscope that’s also internet connected. This form factor creates possibilities for workflows that are were not possible with conventional oscilloscopes - remote labs, smart home/lab control, automatic data collection are some of such possibilities. The Internet of Things Oscilloscope or ioto being introduced in this project is based around the [ESP32 SoC](https://www.espressif.com/en/products/socs/esp32).

## Features and Advantages

### Web Application
The most important feature of ioto is its custom web application which can be accessed via an access point IP address served by the ESP32. Since the web application is the control mechanism for ioto, it makes the device truly wireless. This means a user can create an experimental setup with ioto and can remotely control equipment, record and export data, and monitor the experiment without having to be physically present in lab. The interface of the web application is incredibly intuitive and is divided into two sections: Digital and Analog, corresponding to ioto's two main functionalities.

![Screenshot 2022-04-28 100854](https://user-images.githubusercontent.com/38775985/165778796-3ffd0167-54e7-45f9-b518-7800993c0cb6.png)

### Digital IO
ioto contains 6 digital channels (which can be easily expanded). The digital channels can set as input or output and can read or set logic `HIGH (1)` or `LOW (0)` on each of the channels independently. The state and value of each of the digital channels can be set using the web application. The digital IO functionality can support a multitude of applications from basic button/interrupt handling and LED control to complex combinational logics and circuits.

### Analog Scoping
ioto contains 2 analog channels (which can also be easily expanded). The analog scope can read analog voltages in the range of 0-2.5V. Each channel independently reads the voltage and plots it on a graph on the web application. The sampling frequency can be changed, the plot can be paused, and graphs can be exported as images. The analog scoping functionality can be used in a multitude applications as well from sensor data recording to circuit debugging.

## Technical Specifications
* Analog channels - 2 (expandable to 18 for ESP32-S2 dev board)
* Analog-to-digital conversion (ADC) resolution - 12 bits
* Measurable analog input voltage range - 0 mV ~ 2500 mV (at 11 dB attenutation)
* Digital channels - 6 (expandable to 34 for ESP32-S2 dev board)

## How to Use
### Hardware Required
* ESP32-S2 development board (other ESP32 boards work with pin changes in `firmware/main.py`)

### Connections
| ESP32-S2                    | ioto        |
| --------------------------- | ----------- |
| GPIO42                      | D1          |
| GPIO41                      | D2          |
| ..                          | ..          |
| GPIO37                      | D6          |
| GPIO7 (ADC1_6)              | Channel 1   |
| GPIO6 (ADC1_5)              | Channel 2   |

NOTE: The above connections can be modified in `firmware/main.py`

### Running the Code
ioto runs on [MicroPython](https://micropython.org/) 1.24 or newer.

1. Flash MicroPython to the board by following the [ESP32-S2 download page](https://micropython.org/download/?port=esp32) instructions.
2. Clone this repository and install [mpremote](https://docs.micropython.org/en/latest/reference/mpremote.html):
   ```
   git clone git@github.com:arshnooramin/iotoscope.git
   cd iotoscope
   pip install mpremote
   ```
3. Add your Wi-Fi credentials:
   ```
   cp firmware/config.example.py firmware/config.py
   ```
4. Copy the firmware and web app to the board (pass the serial port if mpremote can't find it):
   ```
   tools/deploy.sh
   ```
   If `mpy-cross` is installed, the deploy script precompiles the libraries to save RAM. Its version must match the board's MicroPython version.

### Example Output
Open a serial console with `mpremote` and you should see:
```
got ip: [Web App IP]
web app at http://ioto.local/
```
You can now navigate to that IP address (or `http://ioto.local/`) to access the ioto Web Application.

## How It Works
At the center of the ioto project are WebSockets. WebSockets are used here to allow for a two-way communication between the browser and the ESP32.

![Screenshot 2022-04-28 120116](https://user-images.githubusercontent.com/38775985/165795105-56ed0f16-4631-44c2-9c65-ba05b78a1dd4.png)

The ioto project has two main components: the web application and the MicroPython program. The web application is built using **HTML/CSS** and **JavaScript**. HTML/CSS defines the structure of the website and how it looks. JavaScript includes WebSocket code so that the user interactions recorded on the web application via DOM events can be sent back to the ESP32. The ESP32 then performs the function that the user requsted and sends information back to the web application/browser where it is displayed to the user.

It is important to note that the HTML, CSS, and JavaScript files are actually served by the ESP32 itself, from its flash filesystem, using [Microdot](https://github.com/miguelgrinberg/microdot). The browser polls the ESP32 for pin levels and analog readings over the WebSocket and draws the readings on a canvas. The page has no external dependencies, so it works on networks without internet access.

![Screenshot 2022-04-28 120825](https://user-images.githubusercontent.com/38775985/165796568-325a095d-f666-4ea4-bd51-6b7b15d69ae8.png)

