#![windows_subsystem = "windows"]

use std::sync::atomic::{AtomicI32, Ordering};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, DrawTextW, EndPaint, FillRect, GetStockObject, HBRUSH, InvalidateRect, PAINTSTRUCT,
    UpdateWindow, WHITE_BRUSH, DT_CENTER, DT_SINGLELINE, DT_VCENTER,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetClientRect, GetMessageW,
    LoadCursorW, PostQuitMessage, RegisterClassW, SetTimer, SetWindowTextW, ShowWindow, TranslateMessage,
    CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, HMENU, IDC_ARROW, MSG, SW_SHOW, WM_CREATE,
    WM_DESTROY, WM_PAINT, WM_TIMER, WNDCLASSW, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
};
use windows::core::{PCWSTR, Result, w};

#[unsafe(no_mangle)]
static TARGET_NUMBER: AtomicI32 = AtomicI32::new(1337);

const TIMER_ID: usize = 1;
const WINDOW_CLASS: PCWSTR = w!("REXDNumberTargetWindow");

fn window_title() -> String {
    let pid = std::process::id();
    let addr = (&TARGET_NUMBER as *const AtomicI32) as usize;
    format!("REXD Number Target | pid={pid} | addr=0x{addr:016X}")
}

fn window_text() -> String {
    let value = TARGET_NUMBER.load(Ordering::Relaxed);
    format!("Number: {value}")
}

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CREATE => {
            let title = wide_null(&window_title());
            let _ = unsafe { SetWindowTextW(hwnd, PCWSTR(title.as_ptr())) };
            let _ = unsafe { SetTimer(Some(hwnd), TIMER_ID, 250, None) };
            LRESULT(0)
        }
        WM_TIMER => {
            let _ = unsafe { InvalidateRect(Some(hwnd), None, true) };
            LRESULT(0)
        }
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = unsafe { BeginPaint(hwnd, &mut ps) };

            let mut rect = RECT::default();
            let _ = unsafe { GetClientRect(hwnd, &mut rect) };

            let brush = HBRUSH(unsafe { GetStockObject(WHITE_BRUSH) }.0);
            let _ = unsafe { FillRect(hdc, &rect, brush) };

            let mut text = wide_null(&window_text());
            let _ = unsafe { DrawTextW(
                hdc,
                &mut text,
                &mut rect,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE,
            ) };

            let _ = unsafe { EndPaint(hwnd, &ps) };
            LRESULT(0)
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn create_main_window(instance: HINSTANCE) -> Result<HWND> {
    let cursor = unsafe { LoadCursorW(None, IDC_ARROW)? };

    let class = WNDCLASSW {
        hCursor: cursor,
        hInstance: instance,
        lpszClassName: WINDOW_CLASS,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wndproc),
        hbrBackground: HBRUSH(unsafe { GetStockObject(WHITE_BRUSH) }.0),
        ..Default::default()
    };

    unsafe {
        let _ = RegisterClassW(&class);

        let title = wide_null(&window_title());
        let hwnd = CreateWindowExW(
            Default::default(),
            WINDOW_CLASS,
            PCWSTR(title.as_ptr()),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            540,
            220,
            None,
            Some(HMENU::default()),
            Some(instance),
            None,
        )?;

        Ok(hwnd)
    }
}

fn main() -> Result<()> {
    let instance = unsafe { GetModuleHandleW(None)? };
    let hwnd = create_main_window(instance.into())?;

    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = UpdateWindow(hwnd);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).into() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    Ok(())
}
