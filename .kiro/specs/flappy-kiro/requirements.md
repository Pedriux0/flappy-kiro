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
- **Base_Pipe_Speed**: The initial horizontal scroll speed of Pipe_Pairs at the start of a game session, before any difficulty progression is applied.
- **Pipe_Speed**: The current horizontal scroll speed of Pipe_Pairs, which starts at Base_Pipe_Speed and increases with Score up to Max_Pipe_Speed.
- **Max_Pipe_Speed**: The maximum horizontal scroll speed Pipe_Pairs can reach; Pipe_Speed is capped at this value.
- **Speed_Step**: The fixed increment added to Pipe_Speed each time the Score crosses a difficulty threshold.
- **Game_Config**: The single source of gameplay tuning values (physics constants, pipe speeds and difficulty parameters, gap and spacing, cloud parameters, Ghost dimensions, Hitbox radius, display sizes), each with a documented allowed range.
- **Config_Validator**: The component that checks Game_Config values against their allowed ranges when the Game loads.
- **Tuning_Panel**: A developer-only on-screen overlay for viewing and changing Game_Config values while the Game runs.
- **Developer**: The person tuning or building the Game.
- **Cloud_Speed_Ratio**: A Game_Config value for each Cloud_Layer giving that layer's horizontal speed as a fraction of the current Pipe_Speed.
- **Best_Score_Panel**: An overlay shown over the Main_Menu that displays the High_Score and a back control. The Best_Score_Panel is part of the Main_Menu Game_State, not a separate Game_State.
- **Hitbox**: The circular collision region of the Ghost, centred on the Ghost center.
- **Ghost_Animation**: The visual-only animation state of the Ghost (Idle, Flap, Glide, Death). The Ghost_Animation never changes the Ghost position, velocity, or Hitbox.

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

1. WHILE the Game_State is Main_Menu AND the Best_Score_Panel is closed, WHEN the Player performs a mouse click or a screen tap outside the High Scores control, or presses the Spacebar or Enter key, THE Game SHALL set the Game_State to Playing, subject to the exceptions in Requirements 18.5 and 18.6.
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

1. WHILE the Game_State is Playing, THE Game SHALL move each Pipe_Pair horizontally toward the Ghost at the current Pipe_Speed, where the Pipe_Speed applied on any single frame update is identical for every Pipe_Pair, and where the shared Pipe_Speed MAY change over time only as specified in Requirement 15 (Difficulty Progression).
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

1. WHILE the Game_State is Playing, WHEN the Ghost Hitbox intersects the bounding region of any pipe of a Pipe_Pair on a frame update, as defined in Requirement 19.5, THE Game SHALL set the Game_State to Game_Over.
2. WHILE the Game_State is Playing, WHEN the Ghost Hitbox intersects the Ground on a frame update, as defined in Requirement 19.6, THE Game SHALL set the Game_State to Game_Over.
3. WHILE the Game_State is Playing, WHEN the Ghost Hitbox intersects the Ceiling on a frame update, as defined in Requirement 19.6, THE Game SHALL set the Game_State to Game_Over.
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
2. WHILE the Game_State is Game_Over, WHEN the Player performs a mouse click or a screen tap, presses the Spacebar or Enter key, or activates the restart option, THE Game SHALL set the Game_State to Main_Menu.
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

1. WHILE the game is running, THE Game SHALL render the Ghost as a white pixel-styled character measuring between 24 and 48 pixels in both width and height, with a default Ghost sprite size of 32 by 32 pixels as specified in Requirement 19.
2. WHILE the game is running, THE Game SHALL render each Pipe_Pair with green pixel-styled pipes, each pipe having a width between 40 and 80 pixels.
3. WHILE the game is running, THE Game SHALL render the background as a light blue sky containing between 1 and 10 white clouds.
4. WHILE the Score_Display is visible, THE Game SHALL render the Score_Display text using a pixel-styled font at a size between 16 and 48 pixels.
5. WHILE the game is running, THE Game SHALL maintain a rendering frame rate of at least 30 frames per second.
6. WHILE the game is running, THE Game SHALL render each white cloud as semi-transparent, with an opacity between 0.3 and 0.8.
7. WHILE the Game_State is Playing, THE Game SHALL move clouds horizontally, assigning clouds to at least two distinct depth layers where each layer moves at a different constant horizontal speed to create a parallax perspective effect.
8. WHILE the Game_State is Playing, THE Game SHALL move every Cloud_Layer at a horizontal speed strictly less than the current Pipe_Speed, so that clouds appear farther in the background than the pipes even after the Pipe_Speed increases through difficulty progression.

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

### Requirement 15: Difficulty Progression

**User Story:** As a player, I want the game to get gradually harder as my score climbs, so that longer runs stay challenging and interesting.

#### Acceptance Criteria

1. WHEN the Game_State transitions to Playing, THE Game SHALL set the Pipe_Speed to the Base_Pipe_Speed.
2. WHILE the Game_State is Playing, WHEN the Score crosses a fixed threshold interval of every 5 points, THE Game SHALL increase the Pipe_Speed by the Speed_Step.
3. WHILE the Game_State is Playing, IF increasing the Pipe_Speed by the Speed_Step would exceed the Max_Pipe_Speed, THEN THE Game SHALL set the Pipe_Speed to the Max_Pipe_Speed.
4. WHILE the Pipe_Speed equals the Max_Pipe_Speed, WHEN the Score crosses a further threshold interval, THE Game SHALL leave the Pipe_Speed unchanged at the Max_Pipe_Speed.
5. WHEN the Game increases the Pipe_Speed, THE Game SHALL apply the increased Pipe_Speed to all active Pipe_Pairs and all future Pipe_Pairs, so that every Pipe_Pair continues to share a single common Pipe_Speed consistent with Requirement 6.1.
6. WHILE the Game_State is Playing, THE Game SHALL keep every Cloud_Layer horizontal speed strictly less than the current Pipe_Speed after each Pipe_Speed increase, so that the parallax relationship in Requirement 12.8 is preserved.
7. WHEN the Game increases the Pipe_Speed, THE Game SHALL leave the Gap vertical size unchanged, so that difficulty progression alters the Pipe_Speed only and does not change the fixed Gap size defined in Requirement 6.4.

### Requirement 16: Configuration Validation

**User Story:** As a Developer, I want tuning values checked against their allowed ranges when the game loads, so that a tuning change cannot silently break the game's rules.

#### Acceptance Criteria

1. WHEN the Game finishes loading, THE Config_Validator SHALL check every Game_Config value against the allowed range documented for that value.
2. IF a Game_Config value is outside its allowed range, THEN THE Config_Validator SHALL log a console warning naming the Game_Config value, its current setting, and its allowed range.
3. IF a Game_Config value is outside its allowed range, THEN THE Game SHALL continue loading and set the Game_State to Main_Menu as specified in Requirement 1.1, so that Config_Validator warnings are non-blocking.
4. IF the Max_Pipe_Speed is less than the Base_Pipe_Speed, THEN THE Config_Validator SHALL log a console warning naming both Game_Config values and their current settings.
5. IF any Cloud_Speed_Ratio is less than or equal to 0 or greater than or equal to 1, THEN THE Config_Validator SHALL log a console warning naming the affected Cloud_Layer and its Cloud_Speed_Ratio, since that Cloud_Speed_Ratio would violate the parallax relationship in Requirements 12.8 and 15.6.
6. WHEN every Game_Config value is within its allowed range, THE Config_Validator SHALL log zero warnings.
7. THE Game_Config SHALL define default values for Gravity_Constant, Flap_Velocity, Terminal_Velocity, and the difficulty threshold interval equal to the values specified in Requirements 14.1, 14.2, 14.3, and 15.2 respectively.

### Requirement 17: Developer Tuning Panel

**User Story:** As a Developer, I want to adjust gameplay parameters live while playing, so that I can tune the game's feel without editing code and reloading.

#### Acceptance Criteria

1. WHEN the page URL contains the query parameter debug=1, THE Game SHALL enable the Tuning_Panel.
2. WHILE the Tuning_Panel is not enabled, THE Game SHALL NOT display the Tuning_Panel or respond to the Tuning_Panel toggle key.
3. WHILE the Tuning_Panel is enabled, WHEN the Developer presses the "D" key, THE Game SHALL toggle Tuning_Panel visibility.
4. WHILE the Tuning_Panel is visible, THE Tuning_Panel SHALL display editable controls for at least the Gravity_Constant, Flap_Velocity, Terminal_Velocity, Base_Pipe_Speed, Max_Pipe_Speed, Speed_Step, difficulty threshold interval, Gap vertical size, and Pipe_Pair spawn spacing.
5. WHEN the Developer changes a value in the Tuning_Panel, THE Game SHALL apply the new Game_Config value on the next frame update without reloading the page and without resetting the current game session.
6. WHEN the Developer changes a value in the Tuning_Panel, THE Game SHALL constrain the new Game_Config value to the allowed range documented for that value.
7. WHEN the Developer activates the Tuning_Panel copy control, THE Game SHALL copy the current Game_Config values to the clipboard in a format that can be pasted directly into the Game_Config source.
8. WHEN the page is reloaded, THE Game SHALL use the Game_Config values from the Game_Config source and discard all Tuning_Panel changes, so that tuning overrides are not persisted.
9. WHILE the Tuning_Panel is visible, WHEN the Developer interacts with a Tuning_Panel control, THE Game SHALL NOT treat the Tuning_Panel interaction as a flap input.
10. WHILE the Tuning_Panel is enabled, WHEN the Developer changes a value in the Tuning_Panel, THE Game SHALL use the changed Game_Config value in place of the corresponding default value from Requirements 3.4, 6.2, 6.4, 14.1, 14.2, 14.3, and 15.2 for the remainder of the current page session.

### Requirement 18: Best Score Panel

**User Story:** As a player, I want to open a best score view from the main menu, so that I can check my record before playing.

#### Acceptance Criteria

1. WHILE the Game_State is Main_Menu AND the Best_Score_Panel is closed, THE Game SHALL display a Play control and a High Scores control within the visible play area, with no overlap between the two controls' hit areas.
2. WHILE the Game_State is Main_Menu AND the Best_Score_Panel is closed, WHEN the Player activates the High Scores control by mouse click or screen tap within its hit area, or presses the "H" key, THE Game SHALL open the Best_Score_Panel within 100 milliseconds of the input.
3. WHILE the Best_Score_Panel is open, THE Game SHALL display a Back control and the current in-memory High_Score as a non-negative integer between 0 and 999,999,999 that equals the High_Score shown by the Score_Display.
4. WHILE the Best_Score_Panel is open, WHEN the Player activates the Back control by mouse click or screen tap within its hit area, or presses the "Escape" or "H" key, THE Game SHALL close the Best_Score_Panel within 100 milliseconds of the input and keep the Game_State as Main_Menu.
5. WHILE the Best_Score_Panel is open, IF the Player performs a mouse click or a screen tap outside the Back control's hit area, or presses the Spacebar or Enter key, THEN THE Game SHALL keep the Best_Score_Panel open, keep the Game_State as Main_Menu, and SHALL NOT start a game.
6. WHILE the Game_State is Main_Menu, IF the Player activates the High Scores control, THEN THE Game SHALL NOT set the Game_State to Playing for that input and SHALL NOT apply a Flap to the Ghost for that input.
7. WHILE the Game_State is Main_Menu AND the Best_Score_Panel is closed, WHEN the Player activates the Play control by mouse click or screen tap within its hit area, THE Game SHALL start a game as specified in Requirement 2.
8. THE Game SHALL render every Main_Menu, Best_Score_Panel, Paused, and Game_Over control, including the on-screen pause control, with a displayed hit area of at least 44 by 44 pixels.
9. WHEN the Game_State transitions to Main_Menu, whether on initial load or from Game_Over, THE Game SHALL set the Best_Score_Panel to closed.
10. IF the Player holds down the "H" key or "Escape" key so that the browser generates repeated key events, THEN THE Game SHALL open or close the Best_Score_Panel at most once per physical key press and ignore the repeated key events.
11. WHILE the Best_Score_Panel is open, WHEN the Best_Score_Panel is closed by any input in criterion 4, THE Game SHALL NOT start a game or apply a Flap for that same input.

### Requirement 19: Ghost Sprite and Hitbox

**User Story:** As a player, I want the ghost to look crisp and collide fairly, so that hits match what I see.

#### Acceptance Criteria

1. THE Game SHALL render the Ghost sprite in a 32 by 32 logical-canvas-pixel cell whose center is the Ghost position (x, y), so that the cell spans from x − 16 to x + 16 horizontally and from y − 16 to y + 16 vertically on the 480 by 640 logical canvas, with the cell's top-left corner drawn at whole-pixel logical coordinates (x − 16 and y − 16 rounded to the nearest integer).
2. THE Game SHALL fit the Ghost image inside the 32 by 32 pixel cell by scaling the Ghost image uniformly by the factor min(32 ÷ image width, 32 ÷ image height), so that the scaled image's longer side equals 32 pixels, its shorter side is at most 32 pixels, the width-to-height ratio matches the source image within 1 pixel of rounding, and the scaled image is centred both horizontally and vertically within the cell.
3. WHEN the Game finishes loading the Ghost image, THE Game SHALL prepare a scaled 32 by 32 pixel version of the Ghost image exactly once and reuse that scaled version for every rendered frame in every Game_State, with no per-frame rescaling of the source image.
4. THE Game SHALL use a circular Hitbox, centred on the Ghost center, whose radius equals the Game_Config Hitbox radius (default 12 logical canvas pixels), and THE Game SHALL keep the Hitbox radius and center unchanged by Ghost_Animation, sprite rendering, or display scaling of the canvas.
5. WHILE the Game_State is Playing, WHEN a frame update finishes moving the Ghost and Pipe_Pairs and the distance from the Ghost center to the closest point of any top or bottom pipe rectangle of any Pipe_Pair is strictly less than the Hitbox radius, THE Game SHALL treat the overlap as a pipe collision in that same frame update.
6. WHILE the Game_State is Playing, WHEN a frame update finishes moving the Ghost and the Ghost center y plus the Hitbox radius is strictly greater than the Ground y position, or the Ghost center y minus the Hitbox radius is strictly less than the Ceiling y position, THE Game SHALL treat the overlap as a Ground or Ceiling collision respectively in that same frame update.
7. IF the distance from the Ghost center to the closest point of a pipe rectangle equals the Hitbox radius exactly, or the Ghost center y plus the Hitbox radius equals the Ground y position exactly, or the Ghost center y minus the Hitbox radius equals the Ceiling y position exactly, THEN THE Game SHALL NOT treat the contact as a collision.
8. THE Game_Config SHALL expose the Hitbox radius as a value in logical canvas pixels with an allowed range of 8 to 16 inclusive, and the value SHALL NOT exceed half the Ghost sprite size (16 pixels for the 32 pixel sprite).
9. IF the Ghost image fails to load, or has not finished loading within 5 seconds of page open, THEN THE Game SHALL draw a filled white fallback shape contained entirely within the 32 by 32 pixel cell centred on the Ghost position, keep using the same Hitbox center and radius, and continue to the Main_Menu Game_State without displaying a blocking error.
10. IF the Config_Validator finds at load that the Hitbox radius is missing, non-numeric, below 8, above 16, or above half the Ghost sprite size, THEN THE Game SHALL use the default Hitbox radius of 12 pixels and report the rejected value to the Developer through a non-blocking warning, while leaving the other valid Game_Config values unchanged.
11. WHILE the Game_State is Main_Menu, Paused, or Game_Over, THE Game SHALL NOT evaluate or treat any Ghost overlap with a pipe, the Ground, or the Ceiling as a collision.

### Requirement 20: Ghost Animation

**User Story:** As a player, I want the ghost to animate when idle, flapping and crashing, so that the game feels alive.

#### Acceptance Criteria

1. WHILE the Game_State is Main_Menu, THE Game SHALL play the Idle Ghost_Animation as 4 looping frames of 150 milliseconds each (one full cycle every 600 milliseconds, each frame duration within ±17 milliseconds), where each frame holds a constant vertical visual offset between -2 and +2 pixels, at least two of the 4 frames use different offsets, and the Ghost sprite rotation is 0 degrees.
2. WHEN a Flap is applied, including the first Flap applied on the transition to Playing (Requirement 2.3), THE Game SHALL start the Flap Ghost_Animation from its first frame on the same rendered frame the Flap is applied, playing 3 frames lasting 60, 60, and 80 milliseconds (squash, stretch, settle), for a total of 200 milliseconds, with each frame duration within ±17 milliseconds.
3. WHEN a Flap is applied while the Flap Ghost_Animation is playing, THE Game SHALL restart the Flap Ghost_Animation from its first frame on the same rendered frame the Flap is applied, discarding the remaining time of the interrupted Flap Ghost_Animation.
4. WHEN the Flap Ghost_Animation finishes its third frame, THE Game SHALL show the Glide Ghost_Animation on the next rendered frame and keep showing it until the next Flap is applied or the Game_State transitions to Game_Over.
5. WHILE the Game_State is Playing, THE Game SHALL rotate the Ghost sprite linearly according to the Ghost vertical velocity, from -20 degrees at the Flap_Velocity (-450 pixels per second) to +45 degrees at the Terminal_Velocity (700 pixels per second), clamped to the range -20 to +45 degrees, with the rendered angle within ±0.5 degrees of the computed value on every rendered frame (for example, approximately +5.4 degrees at a vertical velocity of 0 pixels per second).
6. WHEN the Game_State transitions to Game_Over, THE Game SHALL play the Death Ghost_Animation in place, starting on the same rendered frame as the transition, as a hit flash (80 milliseconds), then an eye change to crosses (120 milliseconds), then a horizontal shake with a visual offset of 1 to 2 pixels (two frames of 60 milliseconds each, in opposite horizontal directions), for a total of 320 milliseconds with each phase duration within ±17 milliseconds, and keep the Ghost sprite rotation fixed at the angle rendered on the last Playing frame.
7. WHILE the Death Ghost_Animation plays, THE Game SHALL keep the Ghost vertical position unchanged, consistent with Requirement 8.5.
8. WHILE the Game_State is Paused, THE Game SHALL freeze the current Ghost_Animation frame, the elapsed time within that frame, and the Ghost sprite rotation, and WHEN the Game_State returns to Playing, THE Game SHALL resume from the frozen frame with only the remaining time of that frame left to play.
9. THE Game SHALL apply Ghost_Animation offsets, scaling, rotation, flash, and opacity to rendering only, so that the Ghost position, velocity, and Hitbox on every frame update are identical to the values they would have with the Ghost_Animation disabled.
10. WHERE the user has enabled the reduced-motion preference in the browser or operating system, THE Game SHALL render the Idle offset as 0 pixels, render the Death shake as 0 pixels, and omit the hit flash, while keeping the eye change, the opacity change, and the 320-millisecond total duration and phase timings of the Death Ghost_Animation unchanged.
11. THE Game SHALL NOT flash the Ghost more than 3 times in any 1-second period, where a flash is any rendered frame sequence in which the Ghost sprite brightness is raised above its normal rendering for the hit flash.
12. WHEN the Death Ghost_Animation finishes its final shake frame, THE Game SHALL hold the final Death frame (crossed eyes, no shake offset, rotation fixed per criterion 6) at 0.7 opacity until the Game_State leaves Game_Over.
13. WHEN the Game_State transitions to Main_Menu, THE Game SHALL set the Ghost_Animation to Idle starting from its first frame on the same rendered frame, with the Ghost sprite at 1.0 opacity, normal (non-crossed) eyes, 0 degrees rotation, and no hit flash or shake offset.
