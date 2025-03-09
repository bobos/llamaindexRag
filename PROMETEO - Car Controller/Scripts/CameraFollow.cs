using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    [Header("跟随设置")]
    public Transform carTransform;

    [Range(1, 10)] public float followSpeed = 2;
    [Range(1, 10)] public float lookSpeed = 5;
    private Vector3 initialCameraPosition;
    private Vector3 initialCarPosition;
    private Vector3 absoluteInitCameraPosition;
    void Start()
    {
        initialCameraPosition = transform.position;
        initialCarPosition = carTransform.position;
        absoluteInitCameraPosition = initialCameraPosition - initialCarPosition;
    }

    void FixedUpdate()
    {
        // 跟随目标移动
        Vector3 targetPos = absoluteInitCameraPosition + carTransform.position;
        transform.position = Vector3.Lerp(transform.position, targetPos, followSpeed * Time.deltaTime);
    }
 }
