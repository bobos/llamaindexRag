/*
using UnityEngine;

public class CameraSwitcher : MonoBehaviour
{
    public Camera[] cameras;  // ��Inspector������������Ҫ�л��������
    private int currentCameraIndex = 0;

    void Start()
    {
        // ��ʼʱ�ر������������ֻ���õ�һ��
        for (int i = 0; i < cameras.Length; i++)
        {
            cameras[i].enabled = (i == 0);
        }
    }

    void Update()
    {
        // �����ּ�1/2/3�л�����������Զ��尴����
        if (Input.GetKeyDown(KeyCode.Alpha1)) SwitchCamera(0);
        if (Input.GetKeyDown(KeyCode.Alpha2)) SwitchCamera(1);
        if (Input.GetKeyDown(KeyCode.Alpha3)) SwitchCamera(2);
    }

    public void SwitchCamera(int newIndex)
    {
        // ��ȫ�Լ��
        if (newIndex < 0 || newIndex >= cameras.Length) return;

        // �رյ�ǰ������������������
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
           //���ӽ�
           isCurrentMain = false;
           SwitchCamera(false);
        }
    }

    public void SwitchCamera(bool setMain)
    {
        // �ӳٽ��þ����������ɢ������
        if (disableCoroutine != null) StopCoroutine(disableCoroutine);
        disableCoroutine = StartCoroutine(DisableCameraDelayed(setMain, 2));

        // ���������������
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
