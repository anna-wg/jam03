# Vehicle Fleet Management System: Technical Specification

## 1. Introduction

This document outlines the technical design for a comprehensive vehicle fleet management system for the emergency dispatch game. It addresses vehicle structure, status management, district mechanics, audio integration, and game flow enhancements.

## 2. Vehicle Data Structure and State Management

### 2.1. Vehicle Interface

The `Vehicle` interface will be the core of our fleet management system. Each vehicle will have the following properties:

```typescript
interface Vehicle {
  id: number;
  type: 'firetruck' | 'police' | 'ambulance';
  district: 'North' | 'South' | 'East' | 'West';
  status: 'available' | 'in-transit' | 'on-call';
}
```

### 2.2. State Management

The vehicle fleet will be managed within the main React component's state using the `useState` hook. This ensures that any changes to the fleet will trigger a re-render of the UI.

```typescript
const [vehicles, setVehicles] = useState<Vehicle[]>([]);
```

## 3. Fleet Initialization and Random Placement

### 3.1. Initial Fleet Composition

The game will start with a fleet of six vehicles:
- 2 Fire Trucks
- 2 Police Cars
- 2 Ambulances

### 3.2. Random Placement Logic

At the start of each game, the `startGame` function will initialize the vehicle fleet. Each vehicle will be assigned a random district.

```typescript
const districts = ['North', 'South', 'East', 'West'];
const getRandomDistrict = () => districts[Math.floor(Math.random() * districts.length)];

const initialVehicles: Vehicle[] = [
  { id: 1, type: 'firetruck', district: getRandomDistrict(), status: 'available' },
  { id: 2, type: 'firetruck', district: getRandomDistrict(), status: 'available' },
  { id: 3, type: 'police', district: getRandomDistrict(), status: 'available' },
  { id: 4, type: 'police', district: getRandomDistrict(), status: 'available' },
  { id: 5, type: 'ambulance', district: getRandomDistrict(), status: 'available' },
  { id: 6, type: 'ambulance', district: getRandomDistrict(), status: 'available' },
];

// In the startGame function:
setVehicles(initialVehicles);
```

## 4. Vehicle Availability Checking Algorithm

The `handleDistrictSelection` function will be updated to incorporate a more robust vehicle availability check.

### 4.1. Algorithm

1.  When a district is selected, filter the `vehicles` array to find a vehicle that matches the `selectedVehicle` type and is `available`.
2.  If multiple vehicles are available, select the one that is closest to the target district.
3.  If no vehicles are available, play the "no vehicle available" audio cue and return the game to `STATE 1`.

### 4.2. Implementation

```typescript
const handleDistrictSelection = (district: District) => {
  // ...
  const availableVehicle = vehicles.find(
    (v) => v.type === selectedVehicle && v.status === 'available'
  );

  if (availableVehicle) {
    // Dispatch the vehicle
  } else {
    // Play "no vehicle available" audio
    setGameState(1);
  }
};
```

## 5. Transit Time Calculation System

### 5.1. District Distance

The distance between districts will be calculated based on a predefined grid. For simplicity, we will assume a distance of 1 unit for adjacent districts and 2 units for diagonal districts.

-   **North <-> South:** 2 units
-   **East <-> West:** 2 units
-   **North <-> East/West:** 1 unit
-   **South <-> East/West:** 1 unit

### 5.2. Transit Time

Each unit of distance will correspond to a 15-second transit time.

### 5.3. Implementation

A helper function will be created to calculate the transit time between two districts.

```typescript
const getTransitTime = (start: District, end: District): number => {
  const distances = {
    North: { South: 2, East: 1, West: 1 },
    South: { North: 2, East: 1, West: 1 },
    East: { West: 2, North: 1, South: 1 },
    West: { East: 2, North: 1, South: 1 },
  };
  return (distances[start][end] || 0) * 15000; // in milliseconds
};
```

## 6. Audio Sequencing for Fleet Announcements

### 6.1. Initial Placement Announcement

The `startGame` function will iterate through the newly initialized fleet and announce the location of each vehicle.

```typescript
// In startGame, after initializing vehicles:
vehicles.forEach(vehicle => {
  const districtAudio = `${vehicle.district.toLowerCase()}_district.wav`;
  playAudioSequence([`${vehicle.type}.wav`, 'located_in.wav', districtAudio]);
});
```

### 6.2. Dispatch Confirmation

The `handleDistrictSelection` function will announce the dispatch of a vehicle.

```typescript
// In handleDistrictSelection, after a successful dispatch:
const districtAudio = `${district.toLowerCase()}_district.wav`;
playAudioSequence([`${selectedVehicle}.wav`, 'dispatched_to.wav', districtAudio]);
```

### 6.3. No Vehicle Available

If no vehicle is available, the system will play a specific audio file.

```typescript
// In handleDistrictSelection, if no vehicle is available:
const vehicleType = selectedVehicle === 'firetruck' ? 'fire' : selectedVehicle;
playAudioSequence([`no-${vehicleType}-${district.toLowerCase()}.mp3`]);
```

## 7. Integration with Existing Game State Machine

The new fleet management logic will be integrated into the existing three-state system.

-   **STATE 0:** No changes.
-   **STATE 1:** No changes to the state itself, but the logic for transitioning to `STATE 2` will now depend on vehicle availability.
-   **STATE 2:** The `handleDistrictSelection` function will be the primary integration point, handling vehicle dispatch, status updates, and timers.

## 8. Status Update Mechanisms and Timers

### 8.1. `in-transit` Status

When a vehicle is dispatched, its status will be set to `in-transit`. A `setTimeout` will be used to simulate the transit time.

### 8.2. `on-call` Status

Once the transit is complete, the vehicle's status will change to `on-call`. The duration of the call will vary based on the call type.

### 8.3. `available` Status

After the on-call duration, the vehicle will return to the `available` status in its new district.

### 8.4. Implementation

```typescript
const dispatchVehicle = (vehicle: Vehicle, targetDistrict: District) => {
  const transitTime = getTransitTime(vehicle.district, targetDistrict);
  
  // Update vehicle status to in-transit
  setVehicles(prev => prev.map(v => 
    v.id === vehicle.id ? { ...v, status: 'in-transit' } : v
  ));

  setTimeout(() => {
    // Update status to on-call
    setVehicles(prev => prev.map(v => 
      v.id === vehicle.id ? { ...v, status: 'on-call', district: targetDistrict } : v
    ));

    // Simulate on-call duration (e.g., 30 seconds)
    setTimeout(() => {
      setVehicles(prev => prev.map(v => 
        v.id === vehicle.id ? { ...v, status: 'available' } : v
      ));
    }, 30000);
  }, transitTime);
};
```

## 9. Obsolete Audio File Removal

The following audio files will no longer be needed and can be removed from the project:

-   `north-selected.mp3`
-   `south-selected.mp3`
-   `east-selected.mp3`
-   `west-selected.mp3`

This will be handled in the implementation phase.