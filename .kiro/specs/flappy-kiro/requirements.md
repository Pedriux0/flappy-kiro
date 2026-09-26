# Requirements Document

## Introduction

Flappy Kiro is a retro, pixel-styled endless scroller game that runs in a web browser. The player controls a white ghost character that must fly through a continuous series of green pipes. The ghost is constantly pulled down by gravity; the player provides upward flap impulses via input (mouse click, screen tap, or a keyboard key) to keep the ghost airborne and navigate through the gaps between pipes. Each successfully cleared pipe gap increases the score. Colliding with a pipe, the ground, or the ceiling ends the game. The current score and a persisted high score are displayed on screen. The Game manages four states: a Main_Menu shown after load that displays the title and high score, an active Playing state, a Paused state that freezes gameplay and can be resumed, and a Game_Over state that presents the final score and a restart option. The visual style features a white ghost, green top-and-bottom pipes with a gap, a light blue sky with white clouds, and a bottom score display, all rendered with a retro/pixel aesthetic.

## Glossary

- **Game**: The Flappy Kiro browser application as a whole, including rendering, input handling, physics, scoring, and state management.
- **Ghost**: The player-controlled white character that moves vertically in response to gravity and flap input.
- **Player**: The human interacting with the Game through mouse, touch, or keyboard input.
- **Flap**: A single upward impulse applied to the Ghost's vertical velocity in response to a player input event.
- **Pipe_Pair**: A vertically-aligned obstacle consisting of a top green pipe and a bottom green pipe separated by a passable Gap.
- **Gap**: The open vertical space between the top and bottom pipe of a Pipe_Pair through which the Ghost can pass.
- **Ground**: The lower boundary of the play area.
- **Ceiling**: The upper boundary of the play area.
- **Score**: The count of Pipe_Pairs the Ghost has successfully passed during the current game session.
- **High_Score**: The highest Score achieved across game sessions, persisted between plays.
- **Score_Display**: The on-screen element that shows the current Score and the High_Score.
- **Game_State**: The current mode of the Game, one of: Main_Menu, Playing, Paused, or Game_Over.
- **Main_Menu**: The initial screen shown after load, displaying the game title, the High_Score, and a prompt to start playing.
- **Paused**: A Game_State in which gameplay is frozen (no physics, scrolling, or scoring updates) and can be resumed from the exact frozen state.
- **Storage**: The browser local storage mechanism used to persist the High_Score between sessions.
- **Cloud_Layer**: A group of clouds sharing a common parallax scroll speed, representing a distinct depth in the background.
- **Gravity_Constant**: The fixed downward acceleration applied to the Ghost each second while Playing.
- **Flap_Velocity**: The fixed upward (negative) vertical velocity the Ghost is set to when a Flap is applied.
- **Terminal_Velocity**: The maximum downward vertical speed the Ghost can reach; the Ghost's downward velocity is capped at this value.
- **Delta_Time**: The elapsed time in seconds since the previous frame update, used to make motion frame-rate-independent.

## Requirements

### Requirement 1: Game Initialization and Main Menu

**User Story:** As a player, I want the game to load into a main menu that shows my best score, so that I can see the play area and start when I choose.

#### Acceptance Criteria

1. WHEN the Game finishes loading within 5 seconds of page open, THE Game SHALL set the Game_State to Main_Menu.
2. WHILE the Game_State is Main_Menu, THE Game SHALL display the game title, the current High_Score, and a start prompt indicating how to begin play.
3. WHILE the Game_State is Main_Menu, THE Game SHALL display the Ghost at a starting position located horizontally at 30% of the play area width from the left edge and vertically at 50% of the play area height, measured from the Ghost center.
4. WHILE the Game_State is Main_Menu, THE Game SHALL render the light blue sky background with white clouds.
5. WHILE the Game_State is Main_Menu, THE Game SHALL display the Score_Display showing a Score of 0 and the current High_Score as a non-negative integer between 0 and 999,999,999.
6. WHEN the Game finishes loading, THE Game SHALL retrieve the High_Score from Storage within 1 second.
7. IF no High_Score exists in Storage, THEN THE Game SHALL set the displayed High_Score to 0.
8. IF the High_Score retrieved from Storage is missing, unreadable, or not a non-negative integer, THEN THE Game SHALL set the displayed High_Score to 0 and retain the Main_Menu state without interrupting game initialization.

### Requirement 2: Starting a Game

**User Story:** As a player, I want to start the game with an input action, so that gameplay begins on my command.

#### Acceptance Criteria

1. WHILE the Game_State is Main_Menu, WHEN the Player performs a mouse click, a screen tap, or presses the Spacebar key, THE Game SHALL set the Game_State to Playing.
2. WHEN the Game_State transitions to Playing, THE Game SHALL reset the Score to 0.
3. WHEN the Game_State transitions to Playing, THE Game SHALL apply the first Flap to the Ghost using the same fixed upward velocity as any Flap.

### Requirement 3: Ghost Flap Input

**User Story:** As a player, I want to make the ghost flap upward, so that I can control its vertical position against gravity.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Player performs a mouse click, THE Game SHALL apply a Flap to the Ghost within 50 milliseconds of the input event.
2. WHILE the Game_State is Playing, WHEN the Player performs a screen tap, THE Game SHALL apply a Flap to the Ghost within 50 milliseconds of the input event.
3. WHILE the Game_State is Playing, WHEN the Player presses the Spacebar key, THE Game SHALL apply a Flap to the Ghost within 50 milliseconds of the input event.
4. WHEN a Flap is applied, THE Game SHALL set the Ghost vertical velocity to the fixed upward Flap_Velocity value between -400 and -500 pixels per second, replacing any prior vertical velocity.
5. WHILE the Game_State is not Playing, IF the Player performs a mouse click, a screen tap, or presses the Spacebar key, THEN THE Game SHALL NOT apply a Flap to the Ghost.
6. IF the Player performs consecutive flap inputs within the same rendered frame, THEN THE Game SHALL apply exactly one Flap to the Ghost.

### Requirement 4: Gravity and Ghost Movement

**User Story:** As a player, I want the ghost to fall under gravity, so that the game presents a continuous challenge.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL increase the Ghost vertical downward velocity by the Gravity_Constant on each frame update, where the Gravity_Constant is identical for every frame update.
2. WHILE the Game_State is Playing, THE Game SHALL change the Ghost vertical position on each frame update by an amount derived from the current Ghost vertical velocity for that frame update.
3. WHILE the Game_State is Playing, THE Game SHALL limit the Ghost downward vertical velocity to the Terminal_Velocity so that the velocity never exceeds Terminal_Velocity on any frame update.
4. WHILE the Game_State is Playing, THE Game SHALL keep the Ghost horizontal position equal to its fixed starting horizontal position, changing it by zero on every frame update.

### Requirement 5: Pausing and Resuming Gameplay

**User Story:** As a player, I want to pause and resume the game, so that I can step away without losing my current run.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Player presses the "P" key or activates an on-screen pause control, THE Game SHALL set the Game_State to Paused.
2. WHEN the Game_State transitions to Paused, THE Game SHALL stop updating Ghost physics, Pipe_Pair movement, cloud movement, and scoring.
3. WHILE the Game_State is Paused, THE Game SHALL display a paused indicator and preserve the exact position and velocity of the Ghost and all Pipe_Pairs.
4. WHILE the Game_State is Paused, WHEN the Player presses the "P" key or activates an on-screen resume control, THE Game SHALL set the Game_State to Playing and resume gameplay from the preserved position and velocity of the Ghost and all Pipe_Pairs.
5. WHILE the Game_State is Paused, IF the Player performs a mouse click, a screen tap, or presses the Spacebar key, THEN THE Game SHALL NOT apply a Flap to the Ghost.

### Requirement 6: Pipe Generation and Scrolling

**User Story:** As a player, I want green pipes to scroll toward the ghost continuously, so that the game is an endless scroller.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move each Pipe_Pair horizontally toward the Ghost at a fixed constant speed that is identical for every Pipe_Pair on each frame update.
2. WHILE the Game_State is Playing, THE Game SHALL generate a new Pipe_Pair at a fixed horizontal spacing interval so that Pipe_Pairs appear continuously.
3. THE Game SHALL render each Pipe_Pair as a green top pipe and a green bottom pipe separated by a Gap.
4. WHILE the Game_State is Playing, THE Game SHALL assign each new Pipe_Pair a Gap of fixed vertical size, with the Gap vertical position selected within bounds that keep the entire Gap inside the play area.
5. WHEN a Pipe_Pair moves fully past the left edge of the play area, THE Game SHALL remove that Pipe_Pair from the active set.

### Requirement 7: Scoring

**User Story:** As a player, I want to earn points for passing through pipe gaps, so that I can measure my progress.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Ghost horizontal position passes the trailing edge of a Pipe_Pair, THE Game SHALL increase the Score by 1.
2. WHILE the Game_State is Playing, THE Game SHALL count each Pipe_Pair toward the Score exactly once per game session.
3. WHEN the Score increases, THE Game SHALL update the Score_Display to show the current Score.

### Requirement 8: Collision Detection and Game Over

**User Story:** As a player, I want the game to end when the ghost hits an obstacle, so that there is a clear win/loss condition.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Ghost bounding region intersects the bounding region of any pipe of a Pipe_Pair on a frame update, THE Game SHALL set the Game_State to Game_Over.
2. WHILE the Game_State is Playing, WHEN the Ghost bounding region intersects the Ground on a frame update, THE Game SHALL set the Game_State to Game_Over.
3. WHILE the Game_State is Playing, WHEN the Ghost bounding region intersects the Ceiling on a frame update, THE Game SHALL set the Game_State to Game_Over.
4. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop applying horizontal movement to all Pipe_Pairs.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop updating the Ghost vertical position.

### Requirement 9: High Score Persistence

**User Story:** As a player, I want my best score to be saved, so that I can try to beat it across sessions.

#### Acceptance Criteria

1. WHEN the Game_State transitions to Game_Over, IF the Score is greater than the High_Score, THEN THE Game SHALL set the High_Score to the Score.
2. WHEN the Game_State transitions to Game_Over, IF the Score is less than or equal to the High_Score, THEN THE Game SHALL leave the High_Score unchanged.
3. WHEN the High_Score changes, THE Game SHALL write the High_Score to Storage as an integer value.
4. IF writing the High_Score to Storage fails, THEN THE Game SHALL retain the in-memory High_Score value for the remainder of the current session and continue without interrupting gameplay.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL update the Score_Display to show the current Score and the High_Score.

### Requirement 10: Game Over Screen and Restarting

**User Story:** As a player, I want a game over screen with a restart option after losing, so that I can see my result and play again without reloading the page.

#### Acceptance Criteria

1. WHEN the Game_State transitions to Game_Over, THE Game SHALL display a game over screen showing the final Score, the current High_Score, and a restart prompt.
2. WHILE the Game_State is Game_Over, WHEN the Player provides a flap input (mouse click, screen tap, or Spacebar key) or activates the restart option, THE Game SHALL set the Game_State to Main_Menu.
3. WHEN the Game_State transitions to Main_Menu from Game_Over, THE Game SHALL reset the Ghost to the starting position and set the Ghost vertical velocity to zero.
4. WHEN the Game_State transitions to Main_Menu from Game_Over, THE Game SHALL remove all active Pipe_Pairs.
5. WHEN the Game_State transitions to Main_Menu from Game_Over, THE Game SHALL set the Score to 0 and update the Score_Display to show a Score of 0 and the current High_Score.

### Requirement 11: Score Display

**User Story:** As a player, I want to see my current and best score on screen, so that I can track performance during play.

#### Acceptance Criteria

1. WHILE the Game is loaded in any Game_State (Main_Menu, Playing, Paused, or Game_Over), THE Game SHALL render the Score_Display within the visible play area.
2. WHILE the Score_Display is rendered, THE Score_Display SHALL show a labeled current score field whose displayed value equals the current Score as a non-negative integer.
3. WHILE the Score_Display is rendered, THE Score_Display SHALL show a labeled high score field whose displayed value equals the current High_Score as a non-negative integer.

### Requirement 12: Retro Visual Presentation

**User Story:** As a player, I want a retro pixel aesthetic, so that the game has a nostalgic arcade feel.

#### Acceptance Criteria

1. WHILE the game is running, THE Game SHALL render the Ghost as a white pixel-styled character measuring between 24 and 48 pixels in both width and height.
2. WHILE the game is running, THE Game SHALL render each Pipe_Pair with green pixel-styled pipes, each pipe having a width between 40 and 80 pixels.
3. WHILE the game is running, THE Game SHALL render the background as a light blue sky containing between 1 and 10 white clouds.
4. WHILE the Score_Display is visible, THE Game SHALL render the Score_Display text using a pixel-styled font at a size between 16 and 48 pixels.
5. WHILE the game is running, THE Game SHALL maintain a rendering frame rate of at least 30 frames per second.
6. WHILE the game is running, THE Game SHALL render each white cloud as semi-transparent, with an opacity between 0.3 and 0.8.
7. WHILE the Game_State is Playing, THE Game SHALL move clouds horizontally, assigning clouds to at least two distinct depth layers where each layer moves at a different constant horizontal speed to create a parallax perspective effect.
8. WHILE the Game_State is Playing, THE Game SHALL move every cloud layer at a slower horizontal speed than the Pipe_Pair scroll speed, so that clouds appear farther in the background than the pipes.

### Requirement 13: Audio Feedback

**User Story:** As a player, I want sound effects for flapping and game over, so that the game feels responsive and lively.

#### Acceptance Criteria

1. WHEN a Flap is applied, THE Game SHALL begin playback of the jump sound effect within 50 milliseconds of the Flap event.
2. WHEN the Game_State transitions to Game_Over, THE Game SHALL begin playback of the game over sound effect within 50 milliseconds of the transition.
3. WHEN a Flap is applied while the jump sound effect is already playing, THE Game SHALL restart the jump sound effect from its beginning.
4. IF a sound effect asset fails to load or cannot be played, THEN THE Game SHALL continue all gameplay and rendering without interruption and without displaying a blocking error.
5. WHILE the game audio is muted, THE Game SHALL suppress playback of all sound effects.

### Requirement 14: Physics System

**User Story:** As a player, I want the ghost to move with consistent, predictable physics, so that the controls feel responsive and fair.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL apply the Gravity_Constant of 1600 pixels per second squared continuously to the Ghost vertical velocity as a downward acceleration.
2. WHEN a Flap is applied, THE Game SHALL set the Ghost vertical velocity to the Flap_Velocity of -450 pixels per second, replacing any prior vertical velocity so that momentum from a preceding Flap does not accumulate across consecutive Flaps.
3. WHILE the Game_State is Playing, THE Game SHALL cap the Ghost downward vertical velocity at the Terminal_Velocity of 700 pixels per second so that the Ghost never falls faster than the Terminal_Velocity.
4. WHILE the Game_State is Playing AND no Flap is applied on a frame update, THE Game SHALL carry the Ghost vertical velocity over from the previous frame update, modifying the velocity only by the Gravity_Constant and the Terminal_Velocity cap.
5. WHILE the Game_State is Playing, THE Game SHALL scale each Ghost vertical velocity update by the Delta_Time, applying the Gravity_Constant as Gravity_Constant multiplied by Delta_Time.
6. WHILE the Game_State is Playing, THE Game SHALL scale each Ghost vertical position update by the Delta_Time, changing the position by the current Ghost vertical velocity multiplied by Delta_Time, so that motion is consistent regardless of frame rate.
