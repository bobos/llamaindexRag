using UnityEngine;
using System.Collections;
using System;

public class LidarController : MonoBehaviour
{ 
    public Transform carTransform;

    [Range(1, 10)] public float followSpeed = 2;
    [Range(1, 10)] public float lookSpeed = 5;
    private Vector3 initialCameraPosition;
    private Vector3 initialCarPosition;
    private Vector3 absoluteInitCameraPosition;

    [Header("�ڵ�����")]
    [SerializeField] private LayerMask occlusionMask;  // ��Ҫ͸�����ϰ���㼶����"Wall"��
    [SerializeField] private float checkInterval = 0.2f; // �����

    // Start is called once before the first execution of Update after the MonoBehaviour is created
    private RendererTimerManager rendererTimerManager;
    private bool isRunning = false;
    private AdvancedMouseSelector carSelector;
    void Start()
    {
        initialCameraPosition = transform.position;
        initialCarPosition = carTransform.position;
        absoluteInitCameraPosition = initialCameraPosition - initialCarPosition;
        rendererTimerManager = RendererTimerManager.Instance;
        carSelector = AdvancedMouseSelector.Instance;
    }

    void FixedUpdate()
    {
        if (!carSelector.IsSelected())
        {
            return;
        }
        // ����Ŀ���ƶ�
        Vector3 targetPos = absoluteInitCameraPosition + carTransform.position;
        transform.position = Vector3.Lerp(transform.position, targetPos, followSpeed * Time.deltaTime);
    }
    public void StartCheck()
    {
        if (isRunning)
        { return;  }
        isRunning = true;
        StartCoroutine(OcclusionCheck()); // �����ڵ����Э��
    }

    public void StopCheck()
    {
        isRunning = false;
        StopAllCoroutines();
    }

    // Э�̣��������ڵ�
    IEnumerator OcclusionCheck()
    {
        while (true)
        {
            yield return new WaitForSeconds(checkInterval);
            CheckClosestOccluder();
        }
    }

    // ���������ڵ���
    private void CheckClosestOccluder()
    {
        Ray ray = new Ray(transform.position, carTransform.position - transform.position);
        float maxDistance = Vector3.Distance(transform.position, carTransform.position);

        // ���߼�Ⲣ�ҵ��������ײ��
        RaycastHit[] hits = Physics.RaycastAll(ray, maxDistance, occlusionMask);
        RaycastHit closestHit = new RaycastHit();
        bool hasHit = false;

        foreach (RaycastHit hit in hits)
        {
            if (hit.distance < closestHit.distance || !hasHit)
            {
                closestHit = hit;
                hasHit = true;
            }
        }

        // ����͸���߼�
        if (hasHit)
        {
            Renderer hitRenderer = closestHit.collider.GetComponent<Renderer>();
            if (hitRenderer != null)
            {
                rendererTimerManager.AddRenderer(hitRenderer);
            }
        }
    } 
    // �����ã���ʾ�������
    void OnDrawGizmos()
    {
        if (carTransform != null)
        {
            Gizmos.color = Color.black;
            Gizmos.DrawLine(transform.position, carTransform.position);
        }
    }
}

