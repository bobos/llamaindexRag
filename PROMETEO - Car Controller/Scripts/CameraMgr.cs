/*
using UnityEngine;

public class CameraSwitcher : MonoBehaviour
{
    public Camera[] cameras;  // 在Inspector中拖入所有需要切换的摄像机
    private int currentCameraIndex = 0;

    void Start()
    {
        // 初始时关闭所有摄像机，只启用第一个
        for (int i = 0; i < cameras.Length; i++)
        {
            cameras[i].enabled = (i == 0);
        }
    }

    void Update()
    {
        // 按数字键1/2/3切换摄像机（可自定义按键）
        if (Input.GetKeyDown(KeyCode.Alpha1)) SwitchCamera(0);
        if (Input.GetKeyDown(KeyCode.Alpha2)) SwitchCamera(1);
        if (Input.GetKeyDown(KeyCode.Alpha3)) SwitchCamera(2);
    }

    public void SwitchCamera(int newIndex)
    {
        // 安全性检查
        if (newIndex < 0 || newIndex >= cameras.Length) return;

        // 关闭当前摄像机，启用新摄像机
        cameras[currentCameraIndex].enabled = false;
        cameras[newIndex].enabled = true;
        currentCameraIndex = newIndex;
    }
}
*/
using UnityEngine;
using System.Collections;

public class CameraSwitcherWithPool : MonoBehaviour
{
    public Camera mainCamera;
    public Camera topCamera;
    private Coroutine disableCoroutine;

    private AdvancedMouseSelector carSelector;
    private bool isCurrentMain = true;
    void Start()
    {
        topCamera.gameObject.SetActive(false);
        carSelector = AdvancedMouseSelector.Instance;
    }
    void Update()
    {
        if (carSelector.IsSelected() && !isCurrentMain)
        {
            isCurrentMain = true;
            SwitchCamera(true);
            return;
        }
        if (!carSelector.IsSelected() && isCurrentMain)
        {
           //顶视角
           isCurrentMain = false;
           SwitchCamera(false);
        }
    }

    public void SwitchCamera(bool setMain)
    {
        // 延迟禁用旧摄像机（分散开销）
        if (disableCoroutine != null) StopCoroutine(disableCoroutine);
        disableCoroutine = StartCoroutine(DisableCameraDelayed(setMain, 2));

        // 立即启用新摄像机
        if (setMain) mainCamera.gameObject.SetActive(true);
        else topCamera.gameObject.SetActive(true);
    }

    private IEnumerator DisableCameraDelayed(bool setMain, int delayFrames)
    {
        for (int i = 0; i < delayFrames; i++) yield return null;
        if (setMain) topCamera.gameObject.SetActive(false);
        else mainCamera.gameObject.SetActive(false);
    }
}
