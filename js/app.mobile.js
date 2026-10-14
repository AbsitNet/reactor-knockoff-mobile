(function() {
'use strict';

/////////////////////////////
// Touch / mobile controls
//
// This file does not touch the game logic. It translates touch input into
// the same mouse and keyboard events the desktop version already handles:
//   - Build/Sell mode     -> left/right mouse button
//   - Placement pattern   -> Shift/Ctrl/Alt modifiers
//   - Step                -> holding number keys 2-9
/////////////////////////////

var $html = document.documentElement;
var $main = $('#main');
var $reactor = $('#reactor');
var $reactor_section = $('#reactor_section');
var $reactor_wrapper = $('#reactor_wrapper');
var $parts_section = $('#parts_section');
var $tooltip = $('#tooltip');

var storage = {
	get: function(key, def) {
		try {
			var v = window.localStorage.getItem('rks_mobile_' + key);
			return v === null ? def : v;
		} catch (e) {
			return def;
		}
	},
	set: function(key, value) {
		try {
			window.localStorage.setItem('rks_mobile_' + key, value);
		} catch (e) {}
	}
};

var is_touch = ('ontouchstart' in window)
	|| (navigator.maxTouchPoints > 0)
	|| (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

var mark_touch = function() {
	$html.classList.add('touch_input');
	$main.classList.add('touch');
};

if ( is_touch ) {
	mark_touch();
}

// Hybrid devices: switch to touch UI on first touch
window.addEventListener('touchstart', function() {
	if ( !$html.classList.contains('touch_input') ) {
		mark_touch();
		fit_reactor();
	}
}, {passive: true, capture: true});

/////////////////////////////
// Toolbar state
/////////////////////////////

var mode = 'place'; // place | sell | pan
var pattern = 'single';
var step = 1;

var patterns = {
	single:  {},
	same:    {shiftKey: true},
	row:     {ctrlKey: true},
	row_all: {ctrlKey: true, shiftKey: true},
	col:     {altKey: true},
	col_all: {altKey: true, shiftKey: true},
	checker: {ctrlKey: true, altKey: true, shiftKey: true}
};

var $modes = document.querySelectorAll('#touch_toolbar .touch_mode');

var set_mode = function(new_mode) {
	mode = new_mode;
	for ( var i = 0; i < $modes.length; i++ ) {
		$modes[i].classList.toggle('active', $modes[i].getAttribute('data-mode') === mode);
	}
	$html.classList.toggle('touch_pan', mode === 'pan');
	$html.classList.toggle('touch_sell', mode === 'sell');
};

for ( var i = 0; i < $modes.length; i++ ) {
	$modes[i].addEventListener('click', function(e) {
		e.preventDefault();
		set_mode(this.getAttribute('data-mode'));
	});
}

var $touch_pattern = $('#touch_pattern');
$touch_pattern.addEventListener('change', function() {
	pattern = this.value;
	$html.classList.toggle('touch_pattern_active', pattern !== 'single');
});

// The spacing is kept by the hotkeys module, which listens for Digit keys
var send_key = function(type, digit) {
	var evt;
	try {
		evt = new KeyboardEvent(type, {code: 'Digit' + digit, key: String(digit), bubbles: true, cancelable: true});
	} catch (e) {
		return;
	}
	window.dispatchEvent(evt);
};

var $touch_step = $('#touch_step');
$touch_step.addEventListener('change', function() {
	var new_step = parseInt(this.value, 10) || 1;
	if ( step > 1 ) send_key('keyup', step);
	if ( new_step > 1 ) send_key('keydown', new_step);
	step = new_step;
});

// Parts panel collapse
var $parts_toggle = $('#touch_parts_toggle');
var set_parts_collapsed = function(collapsed) {
	$html.classList.toggle('touch_parts_collapsed', collapsed);
	$parts_toggle.innerHTML = collapsed ? 'Parts &#9652;' : 'Parts &#9662;';
	storage.set('parts_collapsed', collapsed ? '1' : '0');
	update_dock_height();
};
$parts_toggle.addEventListener('click', function(e) {
	e.preventDefault();
	set_parts_collapsed(!$html.classList.contains('touch_parts_collapsed'));
});

/////////////////////////////
// Synthetic events
/////////////////////////////

var mouse = function(type, $target, touch, extra) {
	var opts = {
		bubbles: true,
		cancelable: true,
		view: window,
		button: mode === 'sell' ? 2 : 0,
		buttons: mode === 'sell' ? 2 : 1,
		clientX: touch ? touch.clientX : 0,
		clientY: touch ? touch.clientY : 0
	};
	var mods = patterns[pattern] || {};
	for ( var k in mods ) opts[k] = mods[k];
	if ( extra ) {
		for ( var k2 in extra ) opts[k2] = extra[k2];
	}
	$target.dispatchEvent(new MouseEvent(type, opts));
};

/////////////////////////////
// Reactor touch handling
/////////////////////////////

var current_tile = null;
var painting = false;
var pan_start = null;
var pan_moved = false;
var PAN_THRESHOLD = 10;

var tile_from_point = function(x, y) {
	var $el = document.elementFromPoint(x, y);
	while ( $el && $el !== $reactor ) {
		if ( $el.classList && $el.classList.contains('tile') ) {
			return $el;
		}
		$el = $el.parentNode;
	}
	return null;
};

var tile_from_target = function($el) {
	while ( $el && $el !== $reactor ) {
		if ( $el.classList && $el.classList.contains('tile') ) {
			return $el;
		}
		$el = $el.parentNode;
	}
	return null;
};

// Full tap sequence on one tile, like a mouse click
var tap_tile = function($tile, touch) {
	mouse('mouseover', $tile, touch);
	mouse('mousedown', $tile, touch);
	mouse('mouseup', $tile, touch);
	mouse('click', $tile, touch);
	remember_hover($tile);
};

var stop_painting = function(touch) {
	if ( painting ) {
		painting = false;
		mouse('mouseup', current_tile || $reactor, touch);
		if ( current_tile ) {
			mouse('click', current_tile, touch);
		}
	}
	current_tile = null;
};

$reactor.addEventListener('touchstart', function(e) {
	if ( e.touches.length > 1 ) {
		// second finger: stop painting so the user can't accidentally build
		stop_painting();
		pan_start = null;
		return;
	}

	var touch = e.changedTouches[0];
	var $tile = tile_from_target(e.target);

	if ( mode === 'pan' ) {
		pan_start = {x: touch.clientX, y: touch.clientY, tile: $tile};
		pan_moved = false;
		return;
	}

	e.preventDefault();
	if ( !$tile ) return;

	painting = true;
	current_tile = $tile;
	mouse('mouseover', $tile, touch);
	mouse('mousedown', $tile, touch);
	remember_hover($tile);
}, {passive: false});

$reactor.addEventListener('touchmove', function(e) {
	var touch = e.changedTouches[0];

	if ( mode === 'pan' ) {
		if ( pan_start && (
			Math.abs(touch.clientX - pan_start.x) > PAN_THRESHOLD
			|| Math.abs(touch.clientY - pan_start.y) > PAN_THRESHOLD
		) ) {
			pan_moved = true;
		}
		return;
	}

	e.preventDefault();
	if ( !painting ) return;

	var $tile = tile_from_point(touch.clientX, touch.clientY);
	if ( $tile && $tile !== current_tile ) {
		current_tile = $tile;
		mouse('mouseover', $tile, touch);
		mouse('mousemove', $tile, touch);
		remember_hover($tile);
	}
}, {passive: false});

$reactor.addEventListener('touchend', function(e) {
	var touch = e.changedTouches[0];

	if ( mode === 'pan' ) {
		if ( pan_start && !pan_moved && pan_start.tile ) {
			// Plain tap while scrolling mode is on: build like a normal click
			e.preventDefault();
			tap_tile(pan_start.tile, touch);
		}
		pan_start = null;
		return;
	}

	e.preventDefault();
	stop_painting(touch);
}, {passive: false});

$reactor.addEventListener('touchcancel', function() {
	pan_start = null;
	stop_painting();
});

/////////////////////////////
// Tooltip on touch screens
/////////////////////////////

// Element (tile/part/upgrade) whose tooltip is currently shown
var $hovered = null;
var remember_hover = function($el) {
	$hovered = $el;
	$html.classList.toggle('touch_tooltip_upgrade', !!($el && $el.classList.contains('upgrade')));
};

document.addEventListener('mouseover', function(e) {
	var $el = e.target;
	while ( $el && $el !== document ) {
		if ( $el.classList && ($el.classList.contains('part') || $el.classList.contains('upgrade') || $el.classList.contains('tile')) ) {
			remember_hover($el);
			return;
		}
		$el = $el.parentNode;
	}
}, true);

var close_tooltip = function() {
	if ( $hovered ) {
		// The original code hides the tooltip on mouseout
		$hovered.dispatchEvent(new MouseEvent('mouseout', {bubbles: true, cancelable: true, view: window}));
	} else {
		$main.classList.remove('tooltip_showing');
	}
	armed_upgrade = null;
};

$('#tooltip_close').addEventListener('click', function(e) {
	e.preventDefault();
	e.stopPropagation();
	close_tooltip();
});

// Upgrades: on touch screens the first tap shows the description,
// tapping the same upgrade again (or the Buy button) buys it.
var armed_upgrade = null;
var last_pointer_touch = false;

document.addEventListener('pointerdown', function(e) {
	last_pointer_touch = e.pointerType === 'touch' || e.pointerType === 'pen';
}, true);
document.addEventListener('touchstart', function() {
	last_pointer_touch = true;
}, {passive: true, capture: true});

var closest_upgrade = function($el) {
	while ( $el && $el !== document ) {
		if ( $el.classList && $el.classList.contains('upgrade') ) {
			return $el;
		}
		$el = $el.parentNode;
	}
	return null;
};

document.addEventListener('click', function(e) {
	if ( !e.isTrusted || !last_pointer_touch ) return;

	var $upgrade = closest_upgrade(e.target);
	if ( !$upgrade ) return;

	if ( armed_upgrade === $upgrade && $main.classList.contains('tooltip_showing') ) {
		// second tap: let the original handler buy it, keep tooltip open
		setTimeout(function() { reshow($upgrade); }, 0);
		return;
	}

	e.stopPropagation();
	e.preventDefault();
	armed_upgrade = $upgrade;
	reshow($upgrade);
}, true);

var reshow = function($el) {
	$el.dispatchEvent(new MouseEvent('mouseover', {bubbles: true, cancelable: true, view: window}));
	remember_hover($el);
};

var buy = function(max) {
	if ( !$hovered || !$hovered.classList.contains('upgrade') ) return;
	var $upgrade = $hovered;
	$upgrade.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window, shiftKey: !!max}));
	reshow($upgrade);
};

$('#tooltip_buy_one').addEventListener('click', function(e) {
	e.preventDefault();
	e.stopPropagation();
	buy(false);
});

$('#tooltip_buy_max').addEventListener('click', function(e) {
	e.preventDefault();
	e.stopPropagation();
	buy(true);
});

// Browsers send a "mouseout" right after each tap, which would hide the
// tooltip immediately. On touch the tooltip is closed explicitly instead.
document.addEventListener('mouseout', function(e) {
	if ( e.isTrusted && last_pointer_touch && $html.classList.contains('touch_input') ) {
		e.stopPropagation();
	}
}, true);

// Tapping on an empty spot closes the tooltip
document.addEventListener('click', function(e) {
	if ( !$html.classList.contains('touch_input') || !e.isTrusted || !last_pointer_touch ) return;
	if ( !$main.classList.contains('tooltip_showing') ) return;

	var $el = e.target;
	while ( $el && $el !== document ) {
		if ( $el === $tooltip || $el === $reactor || ($el.classList && (
			$el.classList.contains('part')
			|| $el.classList.contains('upgrade')
			|| $el.id === 'touch_toolbar'
		)) ) {
			return;
		}
		$el = $el.parentNode;
	}

	close_tooltip();
});

/////////////////////////////
// Reactor zoom
/////////////////////////////

// Keep in sync with css/app.mobile.css
var MOBILE_LAYOUT_QUERY = '(max-width: 900px), (pointer: coarse) and (max-height: 500px)';
var ZOOM_MIN = 0.5;
var ZOOM_MAX = 3;
var zoom_supported = ('zoom' in document.documentElement.style);
var user_zoom = parseFloat(storage.get('zoom', '')) || null; // null = fit to screen

var natural_size = function() {
	var prev = $reactor_wrapper.style.zoom;
	$reactor_wrapper.style.zoom = '';
	var w = $reactor_wrapper.offsetWidth;
	$reactor_wrapper.style.zoom = prev;
	return w;
};

var fit_scale = function() {
	var avail = $reactor_section.clientWidth;
	var w = natural_size();
	if ( !avail || !w ) return null;
	return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, avail / w));
};

var apply_zoom = function(z) {
	if ( !zoom_supported ) return;
	$reactor_wrapper.style.zoom = z ? String(Math.round(z * 1000) / 1000) : '';
};

var fit_reactor = function() {
	if ( !zoom_supported ) return;

	// Only scale on small screens or touch devices, the desktop layout stays 1:1
	var mobile_layout = window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
	if ( !mobile_layout && !$html.classList.contains('touch_input') ) {
		apply_zoom(null);
		return;
	}

	if ( user_zoom ) {
		apply_zoom(user_zoom);
		return;
	}

	var z = fit_scale();
	if ( z !== null ) {
		// Fit, but never upscale on large screens
		apply_zoom(mobile_layout ? z : Math.min(1, z));
	}
};

var current_zoom = function() {
	return parseFloat($reactor_wrapper.style.zoom) || 1;
};

var change_zoom = function(factor) {
	user_zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current_zoom() * factor));
	storage.set('zoom', String(user_zoom));
	fit_reactor();
};

$('#touch_zoom_in').addEventListener('click', function(e) {
	e.preventDefault();
	change_zoom(1.2);
});

$('#touch_zoom_out').addEventListener('click', function(e) {
	e.preventDefault();
	change_zoom(1 / 1.2);
});

$('#touch_zoom_fit').addEventListener('click', function(e) {
	e.preventDefault();
	user_zoom = null;
	storage.set('zoom', '');
	fit_reactor();
});

if ( !zoom_supported ) {
	$html.classList.add('no_zoom');
}

/////////////////////////////
// Layout bookkeeping
/////////////////////////////

// Reserve space for the fixed parts dock at the bottom on small screens
var update_dock_height = function() {
	var docked = window.getComputedStyle($parts_section).position === 'fixed';
	var h = docked ? $parts_section.offsetHeight : 0;
	$html.style.setProperty('--dock-height', h + 'px');
};

var fit_task = null;
var schedule_fit = function() {
	if ( fit_task ) return;
	fit_task = (window.requestAnimationFrame || setTimeout)(function() {
		fit_task = null;
		update_dock_height();
		fit_reactor();
	});
};

window.addEventListener('resize', schedule_fit);
window.addEventListener('orientationchange', schedule_fit);

if ( window.ResizeObserver ) {
	// Reactor grows when rows/columns upgrades are bought, section appears when the page is shown
	var ro = new ResizeObserver(schedule_fit);
	ro.observe($reactor);
	ro.observe($reactor_section);
	ro.observe($parts_section);
} else {
	setInterval(schedule_fit, 1000);
}

set_mode('place');
set_parts_collapsed(storage.get('parts_collapsed', '0') === '1');
schedule_fit();

})();
