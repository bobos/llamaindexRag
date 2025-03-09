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

    [Header("遮挡处理")]
    [SerializeField] private LayerMask occlusionMask;  // 需要透明的障碍物层级（如"Wall"）
    [SerializeField] private float checkInterval = 0.2f; // 检测间隔

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
        // 跟随目标移动
        Vector3 targetPos = absoluteInitCameraPosition + carTransform.position;
        transform.position = Vector3.Lerp(transform.position, targetPos, followSpeed * Time.deltaTime);
    }
    public void StartCheck()
    {
        if (isRunning)
        { return;  }
        isRunning = true;
        StartCoroutine(OcclusionCheck()); // 启动遮挡检测协程
    }

    public void StopCheck()
    {
        isRunning = false;
        StopAllCoroutines();
    }

    // 协程：间隔检测遮挡
    IEnumerator OcclusionCheck()
    {
        while (true)
        {
            yield return new WaitForSeconds(checkInterval);
            CheckClosestOccluder();
        }
    }

    // 检测最近的遮挡物
    private void CheckClosestOccluder()
    {
        Ray ray = new Ray(transform.position, carTransform.position - transform.position);
        float maxDistance = Vector3.Distance(transform.position, carTransform.position);

        // 射线检测并找到最近的碰撞体
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

        // 处理透明逻辑
        if (hasHit)
        {
            Renderer hitRenderer = closestHit.collider.GetComponent<Renderer>();
            if (hitRenderer != null)
            {
                rendererTimerManager.AddRenderer(hitRenderer);
            }
        }
    } 
    // 调试用：显示检测射线
    void OnDrawGizmos()
    {
        if (carTransform != null)
        {
            Gizmos.color = Color.black;
            Gizmos.DrawLine(transform.position, carTransform.position);
        }
    }
}

